import type { NetworkPayload } from '@loupe/contract';
import { toCurl } from '../src/panels/curl';

function payload(over: Partial<NetworkPayload> = {}): NetworkPayload {
  return {
    requestId: 'r1',
    status: 'success',
    url: 'https://api.example.com/graphql',
    method: 'POST',
    requestHeaders: { 'content-type': 'application/json' },
    requestBody: {
      content: '{"query":"query Q { a }"}',
      encoding: 'utf8',
      size: 25,
      truncated: false,
      mimeType: 'application/json',
    },
    startTime: 0,
    statusCode: 200,
    responseHeaders: null,
    responseBody: null,
    endTime: 1,
    durationMs: 1,
    error: null,
    stack: 'js',
    protocol: null,
    ...over,
  };
}

describe('toCurl', () => {
  it('rebuilds method, headers, body and url', () => {
    const cmd = toCurl(payload());

    expect(cmd).toContain('-X POST');
    expect(cmd).toContain("-H 'content-type: application/json'");
    expect(cmd).toContain(`--data-raw '{"query":"query Q { a }"}'`);
    expect(cmd).toContain("'https://api.example.com/graphql'");
  });

  it('omits -X for a GET, since curl already does that', () => {
    const cmd = toCurl(payload({ method: 'GET', requestBody: {
      content: null, encoding: 'none', size: 0, truncated: false, mimeType: null,
    } }));

    expect(cmd).not.toContain('-X');
    expect(cmd).not.toContain('--data-raw');
  });

  it('escapes single quotes so the command survives the shell', () => {
    // A body containing a quote would otherwise close the shell string early
    // and send something different from what the app sent — a command that
    // looks plausible and lies.
    const cmd = toCurl(payload({ requestBody: {
      content: `{"note":"it's fine"}`, encoding: 'utf8', size: 20,
      truncated: false, mimeType: 'application/json',
    } }));

    expect(cmd).toContain(`'{"note":"it'\\''s fine"}'`);
  });

  it('redacts credentials by default', () => {
    // curl commands get pasted into tickets and chats. For most apps the
    // Authorization header is a live session token.
    const cmd = toCurl(payload({
      requestHeaders: { authorization: 'Bearer secret-token', cookie: 'sid=abc' },
    }));

    expect(cmd).toContain('authorization: <redacted>');
    expect(cmd).toContain('cookie: <redacted>');
    expect(cmd).not.toContain('secret-token');
    expect(cmd).not.toContain('sid=abc');
  });

  it('includes the real credential when asked explicitly', () => {
    const cmd = toCurl(
      payload({ requestHeaders: { authorization: 'Bearer secret-token' } }),
      { redactAuth: false },
    );

    expect(cmd).toContain('Bearer secret-token');
  });

  it('drops headers curl derives for itself', () => {
    // A stale content-length makes the request fail in a way that looks like a
    // server problem.
    const cmd = toCurl(payload({
      requestHeaders: { 'content-length': '999', host: 'api.example.com', accept: 'application/json' },
    }));

    expect(cmd).not.toContain('content-length');
    expect(cmd).not.toContain('host:');
    expect(cmd).toContain('accept: application/json');
  });

  it('says so when the body was truncated by capture', () => {
    const cmd = toCurl(payload({ requestBody: {
      content: '{"query":"query Very', encoding: 'utf8', size: 99999,
      truncated: true, mimeType: 'application/json',
    } }));

    expect(cmd).toMatch(/truncated/i);
  });

  it('says so rather than inventing a binary body', () => {
    const cmd = toCurl(payload({ requestBody: {
      content: 'AAECAw==', encoding: 'base64', size: 4,
      truncated: false, mimeType: 'application/octet-stream',
    } }));

    expect(cmd).toMatch(/binary body omitted/i);
    expect(cmd).not.toContain('--data-raw');
  });
});
