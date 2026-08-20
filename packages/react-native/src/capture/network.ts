import type { DebugEvent, NetworkPayload } from '@loupe/contract';
import type { EventBus } from '@loupe/core';
import { captureBody, EMPTY_BODY, DEFAULT_BODY_CAP_BYTES } from './body';
import { nextId } from './ids';

const PLUGIN_ID = 'network';

interface RequestState {
  requestId: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: NetworkPayload['requestBody'];
  startTime: number;
  settled: boolean;
}

/** Parse the CRLF-delimited string XHR returns, lowercasing keys. */
function parseResponseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split('\r\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    if (key) out[key] = line.slice(separator + 1).trim();
  }
  return out;
}

/**
 * The response body as text, when it can be had synchronously.
 *
 * React Native's fetch polyfill drives XHR with responseType 'blob', and RN
 * only populates responseText for text-typed responses — so for most fetch
 * traffic this returns '' and the caller has to fall back to the Blob.
 */
function readResponseText(xhr: XMLHttpRequest): string | null {
  try {
    const text = xhr.responseText;
    return typeof text === 'string' && text !== '' ? text : null;
  } catch {
    // responseType makes responseText unreadable on some platforms.
    return null;
  }
}

function isBlob(v: unknown): boolean {
  const B = (globalThis as { Blob?: unknown }).Blob;
  return typeof B === 'function' && v instanceof (B as new () => object);
}

/**
 * Read a Blob's text, asynchronously, because that is the only way.
 *
 * A React Native Blob keeps its payload behind a native handle — the JS object
 * is just `{ _data: { blobId, offset, size, type } }`. Capturing it directly
 * serialised that wrapper into the panel in place of the body, which on a
 * GraphQL error response hid the `errors` array completely and made a failed
 * operation read as a clean 200.
 *
 * Nothing here may throw into the host: this runs off the app's own response
 * handling, and a debug tool that breaks a request is worse than one that
 * shows nothing.
 */
function readBlobText(blob: unknown, done: (text: string | null) => void): void {
  try {
    const F = (globalThis as unknown as { FileReader?: new () => unknown }).FileReader;
    if (typeof F !== 'function') return done(null);

    const reader = new F() as {
      onload: (() => void) | null;
      onerror: (() => void) | null;
      result: unknown;
      readAsText: (b: unknown) => void;
    };
    reader.onload = () => done(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => done(null);
    reader.readAsText(blob);
  } catch {
    done(null);
  }
}

export function installNetworkCapture(
  bus: EventBus,
  options: { bodyCapBytes?: number } = {},
): () => void {
  const XHR = (globalThis as { XMLHttpRequest?: { prototype: XMLHttpRequest } }).XMLHttpRequest;
  if (!XHR) return () => {};

  const cap = options.bodyCapBytes ?? DEFAULT_BODY_CAP_BYTES;
  const proto = XHR.prototype as unknown as Record<string, unknown>;
  const originalOpen = proto.open as (...args: unknown[]) => unknown;
  const originalSetRequestHeader = proto.setRequestHeader as (...args: unknown[]) => unknown;
  const originalSend = proto.send as (...args: unknown[]) => unknown;

  const states = new WeakMap<object, RequestState>();

  function emit(payload: NetworkPayload): void {
    const event: DebugEvent = {
      schemaVersion: 0, // stamped by the bus
      id: nextId('evt'),
      type: PLUGIN_ID,
      timestamp: Date.now(),
      sourcePluginId: PLUGIN_ID,
      payload,
    };
    bus.emit(event);
  }

  function base(state: RequestState): Omit<NetworkPayload, 'status'> {
    // The complete emit must repeat the request fields, not only the response:
    // upsert replaces the record wholesale.
    return {
      requestId: state.requestId,
      url: state.url,
      method: state.method,
      requestHeaders: state.requestHeaders,
      requestBody: state.requestBody,
      startTime: state.startTime,
      statusCode: null,
      responseHeaders: null,
      responseBody: null,
      endTime: null,
      durationMs: null,
      error: null,
      stack: 'js',
      protocol: null, // XHR does not expose the negotiated protocol
    };
  }

  proto.open = function patchedOpen(this: object, method: string, url: string, ...rest: unknown[]) {
    // Capture bookkeeping must never stand between the app and the real
    // request: a throw here is swallowed so originalOpen always runs.
    try {
      states.set(this, {
        requestId: nextId('req'),
        method: String(method ?? 'GET').toUpperCase(),
        url: String(url ?? ''),
        requestHeaders: {},
        requestBody: EMPTY_BODY,
        startTime: 0,
        settled: false,
      });
    } catch {
      // Never crash the host: capture is best-effort.
    }
    return originalOpen.call(this, method, url, ...rest);
  };

  proto.setRequestHeader = function patchedSetRequestHeader(
    this: object,
    name: string,
    value: string,
  ) {
    try {
      const state = states.get(this);
      if (state) state.requestHeaders[String(name).toLowerCase()] = String(value);
    } catch {
      // Never crash the host: capture is best-effort.
    }
    return originalSetRequestHeader.call(this, name, value);
  };

  proto.send = function patchedSend(this: object, body?: unknown) {
    // Everything in this block is capture bookkeeping around the real send.
    // captureBody and bus.emit are themselves documented never-throw, but the
    // guarantee that matters here is the patch's, not its callees': a failure
    // anywhere above must still fall through to originalSend below.
    try {
      const state = states.get(this);
      const xhr = this as XMLHttpRequest & { response?: unknown };

      if (state) {
        state.startTime = Date.now();
        state.requestBody = captureBody(body, state.requestHeaders['content-type'] ?? null, cap);
        emit({ ...base(state), status: 'pending' });

        const settle = (outcome: { error?: string }) => {
          try {
            if (state.settled) return;
            state.settled = true;

            const endTime = Date.now();
            const status = xhr.status ?? 0;
            const failed = outcome.error !== undefined;
            const responseHeaders = failed
              ? null
              : parseResponseHeaders(xhr.getAllResponseHeaders() ?? '');
            const mime = failed ? null : (responseHeaders?.['content-type'] ?? null);

            const complete = (bodySource: unknown) =>
              emit({
                ...base(state),
                status: failed || status >= 400 || status === 0 ? 'error' : 'success',
                statusCode: failed ? null : status,
                responseHeaders,
                responseBody: failed ? null : captureBody(bodySource, mime, cap),
                endTime,
                durationMs: endTime - state.startTime,
                error:
                  outcome.error ??
                  (status >= 400 ? `HTTP ${status}` : status === 0 ? 'Network request failed' : null),
              });

            const text = failed ? null : readResponseText(xhr);
            const raw = failed ? null : xhr.response;

            if (text !== null || failed || !isBlob(raw)) {
              complete(text ?? raw);
              return;
            }

            // A Blob can only be read asynchronously. Emit now so the request
            // settles immediately with its status and timing, then emit again
            // with the body once it arrives. Panels upsert by requestId — the
            // same mechanism that turns a pending row into a complete one — so
            // the second emit updates the row in place rather than adding one.
            complete(null);
            readBlobText(raw, (blobText) => {
              if (blobText !== null) complete(blobText);
            });
          } catch {
            // Never crash the host: a completion-side capture failure must
            // not break the app's own listeners on this same event.
          }
        };

        xhr.addEventListener('load', () => settle({}));
        xhr.addEventListener('error', () => settle({ error: 'Network request failed' }));
        xhr.addEventListener('abort', () => settle({ error: 'Request aborted' }));
        xhr.addEventListener('timeout', () => settle({ error: 'Request timed out' }));
      }
    } catch {
      // Never crash the host: capture is best-effort.
    }

    return originalSend.call(this, body);
  };

  return () => {
    proto.open = originalOpen;
    proto.setRequestHeader = originalSetRequestHeader;
    proto.send = originalSend;
  };
}
