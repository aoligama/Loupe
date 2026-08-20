/// <reference types="node" />
import { captureBody, EMPTY_BODY, DEFAULT_BODY_CAP_BYTES } from '../src/capture/body';

// Jest runs under Node, so Buffer is available HERE to decode and verify the
// hand-written base64 — even though Buffer is absent in the RN runtime, which
// is exactly why body.ts hand-rolls the encoder. Decoding the output is the
// test most likely to catch a subtly wrong encoder or a mis-scaled truncation.
function decodeBase64(content: string): Uint8Array {
  return new Uint8Array(Buffer.from(content, 'base64'));
}

describe('captureBody', () => {
  it('reports an absent body as encoding none', () => {
    expect(captureBody(null, null)).toEqual(EMPTY_BODY);
    expect(captureBody(undefined, null)).toEqual(EMPTY_BODY);
    expect(captureBody('', null)).toEqual(EMPTY_BODY);
  });

  it('captures text as utf8 with a byte size', () => {
    const body = captureBody('hello', 'text/plain');
    expect(body).toEqual({
      content: 'hello',
      encoding: 'utf8',
      size: 5,
      truncated: false,
      mimeType: 'text/plain',
    });
  });

  it('sizes multi-byte text in bytes, not characters', () => {
    const body = captureBody('☃', 'text/plain');
    expect(body.size).toBe(3);
  });

  it('serializes an object body as JSON', () => {
    const body = captureBody({ a: 1 }, 'application/json');
    expect(body.content).toBe('{"a":1}');
    expect(body.encoding).toBe('utf8');
  });

  it('truncates above the cap, keeping the real byte count in size', () => {
    const body = captureBody('x'.repeat(100), 'text/plain', 10);
    expect(body.truncated).toBe(true);
    expect(body.size).toBe(100);
    expect(body.content).toHaveLength(10);
  });

  it('does not mark a body at exactly the cap as truncated', () => {
    const body = captureBody('x'.repeat(10), 'text/plain', 10);
    expect(body.truncated).toBe(false);
    expect(body.size).toBe(10);
  });

  it('defaults the cap to 256 KB', () => {
    expect(DEFAULT_BODY_CAP_BYTES).toBe(262144);
    const body = captureBody('x'.repeat(300000), 'text/plain');
    expect(body.truncated).toBe(true);
    expect(body.content).toHaveLength(DEFAULT_BODY_CAP_BYTES);
  });

  // The cap is a BYTE budget. Truncating by character would let multi-byte
  // text through at up to 3-4x the cap, defeating the buffer byte budgets.
  it('truncates multi-byte text to the byte cap, not the character count', () => {
    const snowmen = '☃'.repeat(100); // 3 bytes each, 300 bytes total
    const body = captureBody(snowmen, 'text/plain', 10);

    expect(body.size).toBe(300);
    expect(body.truncated).toBe(true);
    // 10-byte cap holds 3 whole snowmen (9 bytes); a 4th would spill to 12.
    expect(body.content).toBe('☃☃☃');
    expect(utf8ByteLengthOf(body.content!)).toBeLessThanOrEqual(10);
  });

  it('never splits a multi-byte character at the cap boundary', () => {
    // Cap lands mid-character: 4 bytes holds one snowman (3), not one and a third.
    const body = captureBody('☃☃', 'text/plain', 4);
    expect(body.content).toBe('☃');
    expect(body.truncated).toBe(true);
  });

  it('produces base64 that decodes back to the original bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    const body = captureBody(bytes.buffer, 'application/octet-stream');
    expect(body.encoding).toBe('base64');
    expect(decodeBase64(body.content!)).toEqual(bytes);
  });

  it('emits correct base64 padding for every remainder', () => {
    // remainder 1, 2, 0 — the padding cases a divisible-by-3 test would miss.
    expect(decodeBase64(captureBody(new Uint8Array([1]).buffer, 'x/x').content!))
      .toEqual(new Uint8Array([1]));
    expect(decodeBase64(captureBody(new Uint8Array([1, 2]).buffer, 'x/x').content!))
      .toEqual(new Uint8Array([1, 2]));
    expect(decodeBase64(captureBody(new Uint8Array([1, 2, 3]).buffer, 'x/x').content!))
      .toEqual(new Uint8Array([1, 2, 3]));
  });

  it('truncates binary on the byte cap and stays valid, decodable base64', () => {
    const bytes = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));
    const body = captureBody(bytes.buffer, 'application/octet-stream', 30);

    expect(body.size).toBe(100);
    expect(body.truncated).toBe(true);
    // The retained base64 must decode to exactly the first 30 bytes.
    expect(decodeBase64(body.content!)).toEqual(bytes.subarray(0, 30));
  });

  it('honors a typed-array view into a larger buffer', () => {
    // A view over bytes 2..5 of an 8-byte buffer must capture [2,3,4,5], not
    // the whole backing buffer.
    const backing = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const view = new Uint8Array(backing.buffer, 2, 4);
    const body = captureBody(view, 'application/octet-stream');

    expect(body.size).toBe(4);
    expect(decodeBase64(body.content!)).toEqual(new Uint8Array([2, 3, 4, 5]));
  });

  it('base64-encodes a string under a binary mime without mangling high characters', () => {
    // '€' is U+20AC → 3 UTF-8 bytes. The old code masked charCodeAt & 0xff and
    // lost information; the encoder must round-trip it.
    const body = captureBody('€', 'application/octet-stream');
    expect(body.encoding).toBe('base64');
    expect(body.size).toBe(3);
    expect(decodeBase64(body.content!)).toEqual(new Uint8Array([0xe2, 0x82, 0xac]));
  });

  it('encodes an astral (4-byte) character correctly, and truncates it whole', () => {
    // The 4-byte branch of both the encoder and the byte-cap truncator is the
    // trickiest and, until now, the only untested one. '😀' is U+1F600 → a
    // surrogate pair in UTF-16, 4 UTF-8 bytes.
    const body = captureBody('a😀b', 'application/octet-stream');
    expect(body.size).toBe(6); // 1 + 4 + 1
    expect(decodeBase64(body.content!)).toEqual(
      new Uint8Array([0x61, 0xf0, 0x9f, 0x98, 0x80, 0x62]),
    );

    // A 3-byte cap cannot fit the 4-byte emoji, so the text path keeps only 'a'.
    const capped = captureBody('a😀', 'text/plain', 3);
    expect(capped.content).toBe('a');
    expect(capped.truncated).toBe(true);
    expect(capped.size).toBe(5);
  });

  it('encodes a lone surrogate as U+FFFD, matching its counted size', () => {
    const body = captureBody('\uD800', 'application/octet-stream');
    expect(body.size).toBe(3);
    expect(decodeBase64(body.content!)).toEqual(new Uint8Array([0xef, 0xbf, 0xbd]));
  });

  it('base64-encodes an ArrayBuffer regardless of mime type', () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    const body = captureBody(buffer, 'application/json');
    expect(body.encoding).toBe('base64');
    expect(body.size).toBe(3);
  });

  it('treats a zero-length ArrayBuffer as an empty body', () => {
    const body = captureBody(new ArrayBuffer(0), 'application/octet-stream');
    expect(body.encoding).toBe('none');
    expect(body.content).toBeNull();
    expect(body.size).toBe(0);
  });

  it('never throws on an unserializable body', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const body = captureBody(cyclic, 'application/json');
    expect(body.encoding).toBe('none');
    expect(body.content).toBeNull();
  });
});

// Local helper so the byte-cap assertion does not depend on importing an
// internal — mirrors utf8ByteLength for the ASCII+BMP range the test uses.
function utf8ByteLengthOf(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}
