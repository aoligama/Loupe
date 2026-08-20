import { DebugEventBus } from '@loupe/core';
import type { DebugEvent, NetworkPayload } from '@loupe/contract';
import { installNetworkCapture } from '../src/capture/network';

type Handler = () => void;

class FakeXHR {
  static instances: FakeXHR[] = [];

  method = '';
  url = '';
  status = 0;
  response: unknown = null;
  responseText = '';
  responseType = '';
  sent = false;
  private handlers: Record<string, Handler[]> = {};
  private responseHeaders = '';

  constructor() {
    FakeXHR.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(_k: string, _v: string): void {}

  send(_body?: unknown): void {
    this.sent = true;
  }

  addEventListener(type: string, handler: Handler): void {
    (this.handlers[type] ||= []).push(handler);
  }

  getAllResponseHeaders(): string {
    return this.responseHeaders;
  }

  getResponseHeader(name: string): string | null {
    const match = this.responseHeaders
      .split('\r\n')
      .find((line) => line.toLowerCase().startsWith(`${name.toLowerCase()}:`));
    return match ? match.slice(match.indexOf(':') + 1).trim() : null;
  }

  fire(type: string): void {
    (this.handlers[type] || []).forEach((h) => h());
  }

  respond(status: number, headers: string, body: unknown, text?: string): void {
    this.status = status;
    this.responseHeaders = headers;
    this.response = body;
    // React Native populates both: `response` per responseType, `responseText`
    // with the decoded text. Tests that pass only a body keep the old
    // behaviour by mirroring it into responseText.
    this.responseText = text ?? (typeof body === 'string' ? body : '');
    this.fire('load');
  }
}

function payloads(events: DebugEvent[]): NetworkPayload[] {
  return events.map((e) => e.payload as NetworkPayload);
}

describe('installNetworkCapture', () => {
  let bus: DebugEventBus;
  let seen: DebugEvent[];
  let uninstall: () => void;
  let original: unknown;

  beforeEach(() => {
    original = (globalThis as Record<string, unknown>).XMLHttpRequest;
    FakeXHR.instances = [];
    (globalThis as Record<string, unknown>).XMLHttpRequest = FakeXHR;

    bus = new DebugEventBus();
    seen = [];
    bus.subscribe('network', (e) => seen.push(e));
    uninstall = installNetworkCapture(bus);
  });

  afterEach(() => {
    uninstall();
    (globalThis as Record<string, unknown>).XMLHttpRequest = original;
  });

  function request(): FakeXHR {
    const xhr = new (globalThis as unknown as { XMLHttpRequest: new () => FakeXHR }).XMLHttpRequest();
    xhr.open('GET', 'https://api.example.com/items');
    xhr.send();
    return xhr;
  }

  it('lets the real request proceed even when capture throws', () => {
    // The patch guards its bookkeeping so a capture-side failure can never
    // break the app's own request. Force emit to throw and confirm the
    // underlying send still runs and nothing escapes.
    uninstall();
    const throwingBus = {
      emit: () => {
        throw new Error('capture exploded');
      },
      subscribe: () => ({ dispose: () => {} }),
      history: () => [],
      clear: () => {},
      droppedCount: () => 0,
      typeCapRejections: () => 0,
      malformedEventCount: () => 0,
    };
    uninstall = installNetworkCapture(throwingBus as unknown as DebugEventBus);

    const xhr = new (globalThis as unknown as { XMLHttpRequest: new () => FakeXHR }).XMLHttpRequest();
    xhr.open('GET', 'https://api.example.com/items');

    expect(() => xhr.send('body')).not.toThrow();
    expect(xhr.sent).toBe(true); // originalSend ran despite the capture throw
  });

  it('emits a pending event on send', () => {
    request();
    expect(seen).toHaveLength(1);
    const p = payloads(seen)[0]!;
    expect(p.status).toBe('pending');
    expect(p.url).toBe('https://api.example.com/items');
    expect(p.method).toBe('GET');
    expect(p.statusCode).toBeNull();
    expect(p.responseBody).toBeNull();
    expect(p.stack).toBe('js');
  });

  it('emits a second event on load with the same requestId', () => {
    const xhr = request();
    xhr.respond(200, 'content-type: application/json', '{"ok":true}');

    expect(seen).toHaveLength(2);
    const [pending, complete] = payloads(seen);
    expect(complete!.requestId).toBe(pending!.requestId);
    expect(complete!.status).toBe('success');
    expect(complete!.statusCode).toBe(200);
  });

  it('repeats the request fields on the complete emit, not just the response', () => {
    const xhr = request();
    xhr.respond(200, 'content-type: application/json', '{}');

    const complete = payloads(seen)[1]!;
    expect(complete.url).toBe('https://api.example.com/items');
    expect(complete.method).toBe('GET');
    expect(complete.startTime).toBeGreaterThan(0);
  });

  it('coalesces to one record in history while both reach subscribers', () => {
    const xhr = request();
    xhr.respond(200, '', '{}');
    expect(seen).toHaveLength(2);
    expect(bus.history('network')).toHaveLength(1);
  });

  it('lowercases request header keys', () => {
    const xhr = new (globalThis as unknown as { XMLHttpRequest: new () => FakeXHR }).XMLHttpRequest();
    xhr.open('POST', 'https://api.example.com/items');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-Trace-Id', 'abc');
    xhr.send('{}');

    const p = payloads(seen)[0]!;
    expect(p.requestHeaders).toEqual({ 'content-type': 'application/json', 'x-trace-id': 'abc' });
  });

  it('lowercases response header keys', () => {
    const xhr = request();
    xhr.respond(200, 'Content-Type: application/json\r\nX-Rate-Limit: 99', '{}');

    const complete = payloads(seen)[1]!;
    expect(complete.responseHeaders).toEqual({
      'content-type': 'application/json',
      'x-rate-limit': '99',
    });
  });

  it('captures the request body', () => {
    const xhr = new (globalThis as unknown as { XMLHttpRequest: new () => FakeXHR }).XMLHttpRequest();
    xhr.open('POST', 'https://api.example.com/items');
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.send('{"name":"x"}');

    const p = payloads(seen)[0]!;
    expect(p.requestBody.content).toBe('{"name":"x"}');
    expect(p.requestBody.encoding).toBe('utf8');
  });

  it('honours a custom body cap', () => {
    uninstall();
    seen = [];
    uninstall = installNetworkCapture(bus, { bodyCapBytes: 4 });

    const xhr = new (globalThis as unknown as { XMLHttpRequest: new () => FakeXHR }).XMLHttpRequest();
    xhr.open('POST', 'https://api.example.com/items');
    xhr.send('abcdefgh');

    const p = payloads(seen)[0]!;
    expect(p.requestBody.truncated).toBe(true);
    expect(p.requestBody.size).toBe(8);
  });

  it('records a duration on completion', () => {
    const xhr = request();
    xhr.respond(200, '', '{}');
    const complete = payloads(seen)[1]!;
    expect(complete.endTime).not.toBeNull();
    expect(complete.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('marks a 500 as an error status with the status code preserved', () => {
    const xhr = request();
    xhr.respond(500, '', 'boom');
    const complete = payloads(seen)[1]!;
    expect(complete.status).toBe('error');
    expect(complete.statusCode).toBe(500);
  });

  it('reports a transport failure as an error with no status code', () => {
    const xhr = request();
    xhr.fire('error');
    const complete = payloads(seen)[1]!;
    expect(complete.status).toBe('error');
    expect(complete.error).toMatch(/network request failed/i);
    expect(complete.statusCode).toBeNull();
  });

  it('reports an abort and a timeout distinctly', () => {
    request().fire('abort');
    expect(payloads(seen)[1]!.error).toMatch(/aborted/i);

    seen = [];
    request().fire('timeout');
    expect(payloads(seen)[1]!.error).toMatch(/timed out/i);
  });

  it('emits exactly once per completion even if two lifecycle events fire', () => {
    const xhr = request();
    xhr.respond(200, '', '{}');
    xhr.fire('error');
    expect(seen).toHaveLength(2);
  });

  it('restores the original prototype methods on uninstall', () => {
    const patched = FakeXHR.prototype.send;
    uninstall();
    expect(FakeXHR.prototype.send).not.toBe(patched);

    seen = [];
    request();
    expect(seen).toHaveLength(0);
    uninstall = () => {};
  });
});

describe('the response body it captures', () => {
  let bus: DebugEventBus;
  let uninstall: () => void;
  let original: unknown;

  beforeEach(() => {
    original = (globalThis as Record<string, unknown>).XMLHttpRequest;
    FakeXHR.instances = [];
    (globalThis as Record<string, unknown>).XMLHttpRequest = FakeXHR;
    bus = new DebugEventBus();
    uninstall = installNetworkCapture(bus);
  });

  afterEach(() => {
    uninstall();
    (globalThis as Record<string, unknown>).XMLHttpRequest = original;
  });

  it('reads responseText rather than a Blob response object', () => {
    // React Native's fetch polyfill drives XHR with responseType 'blob', and a
    // Blob keeps its payload behind a native handle in `_data`. Capturing
    // xhr.response stringified that wrapper, so the panel showed
    // { "_data": { blobId, offset, size, ... } } in place of the body. Found on
    // a GraphQL error response, where it hid the errors array completely and
    // made a failed operation read as a clean 200.
    const xhr = new (globalThis as unknown as { XMLHttpRequest: new () => FakeXHR }).XMLHttpRequest();
    xhr.open('POST', 'https://api.example.com/graphql');
    xhr.send('{"query":"query Q { a }"}');

    const blobLike = { _data: { blobId: 'abc', offset: 0, size: 42, type: 'application/json' } };
    const realBody = '{"data":null,"errors":[{"message":"Unauthorized"}]}';
    xhr.respond(200, 'content-type: application/json', blobLike, realBody);

    const complete = payloads(bus.history('network')).at(-1)!;
    expect(complete.responseBody!.content).toBe(realBody);
    expect(complete.responseBody!.content).not.toContain('_data');
  });

  it('still captures a binary response, where there is no text to read', () => {
    const xhr = new (globalThis as unknown as { XMLHttpRequest: new () => FakeXHR }).XMLHttpRequest();
    xhr.open('GET', 'https://api.example.com/image');
    xhr.send();

    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    xhr.respond(200, 'content-type: image/png', bytes, '');

    const complete = payloads(bus.history('network')).at(-1)!;
    expect(complete.responseBody!.encoding).toBe('base64');
    expect(complete.responseBody!.size).toBe(4);
  });
});

describe('a Blob response body', () => {
  let bus: DebugEventBus;
  let uninstall: () => void;
  let originalXHR: unknown;
  let originalBlob: unknown;
  let originalFileReader: unknown;
  let pendingRead: ((text: string) => void) | null;

  class FakeBlob {
    constructor(public _data: Record<string, unknown>) {}
  }

  class FakeFileReader {
    result: unknown = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsText(): void {
      // Held open so the test controls when the read resolves, which is the
      // whole point: the request must settle before the body arrives.
      pendingRead = (text: string) => {
        this.result = text;
        this.onload?.();
      };
    }
  }

  beforeEach(() => {
    const g = globalThis as Record<string, unknown>;
    originalXHR = g.XMLHttpRequest;
    originalBlob = g.Blob;
    originalFileReader = g.FileReader;
    FakeXHR.instances = [];
    pendingRead = null;
    g.XMLHttpRequest = FakeXHR;
    g.Blob = FakeBlob;
    g.FileReader = FakeFileReader;

    bus = new DebugEventBus();
    uninstall = installNetworkCapture(bus);
  });

  afterEach(() => {
    uninstall();
    const g = globalThis as Record<string, unknown>;
    g.XMLHttpRequest = originalXHR;
    g.Blob = originalBlob;
    g.FileReader = originalFileReader;
  });

  function send(): FakeXHR {
    const xhr = new (globalThis as unknown as { XMLHttpRequest: new () => FakeXHR }).XMLHttpRequest();
    xhr.open('POST', 'https://api.example.com/graphql');
    xhr.send('{"query":"query Q { a }"}');
    return xhr;
  }

  it('settles the request immediately, without waiting for the body', () => {
    // The status and timing must not be held hostage to an async body read.
    const xhr = send();
    xhr.respond(200, 'content-type: application/json', new FakeBlob({ blobId: 'x', size: 50 }), '');

    const complete = payloads(bus.history('network')).at(-1)!;
    expect(complete.status).toBe('success');
    expect(complete.statusCode).toBe(200);
    expect(complete.durationMs).not.toBeNull();
  });

  it('fills the body in once the blob has been read', () => {
    const xhr = send();
    xhr.respond(200, 'content-type: application/json', new FakeBlob({ blobId: 'x', size: 50 }), '');

    const body = '{"data":null,"errors":[{"message":"Unauthorized"}]}';
    pendingRead!(body);

    const complete = payloads(bus.history('network')).at(-1)!;
    expect(complete.responseBody!.content).toBe(body);
  });

  it('updates the same request rather than adding a second row', () => {
    // Panels upsert by requestId, so the follow-up emit has to carry the same
    // one — otherwise a blob response would appear twice in the list.
    const xhr = send();
    xhr.respond(200, 'content-type: application/json', new FakeBlob({ blobId: 'x', size: 50 }), '');
    pendingRead!('{"data":{"ok":true}}');

    const ids = new Set(payloads(bus.history('network')).map((p) => p.requestId));
    expect(ids.size).toBe(1);
  });

  it('never serialises the Blob wrapper into the panel', () => {
    // The bug this replaced: { "_data": { blobId, offset, size } } shown in
    // place of the body, hiding a GraphQL errors array entirely.
    const xhr = send();
    xhr.respond(200, 'content-type: application/json', new FakeBlob({ blobId: 'x', size: 50 }), '');

    const beforeRead = payloads(bus.history('network')).at(-1)!;
    expect(beforeRead.responseBody!.content ?? '').not.toContain('_data');
    expect(beforeRead.responseBody!.content ?? '').not.toContain('blobId');
  });

  it('leaves the request settled when the blob cannot be read', () => {
    const xhr = send();
    xhr.respond(200, 'content-type: application/json', new FakeBlob({ blobId: 'x', size: 50 }), '');

    // Reader never resolves. The row must still be complete and correct.
    const complete = payloads(bus.history('network')).at(-1)!;
    expect(complete.status).toBe('success');
    expect(() => uninstall()).not.toThrow();
  });
});
