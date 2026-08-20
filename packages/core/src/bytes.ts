import type { DebugEvent } from '@loupe/contract';

/** UTF-8 byte length of a string, computed without TextEncoder or Buffer. */
export function utf8ByteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate. Only a genuine pair encodes to 4 bytes, so check the
      // next unit before consuming it: an unpaired high surrogate would
      // otherwise swallow the character after it and the count would silently
      // lose content.
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else {
        bytes += 3; // unpaired surrogate encodes as U+FFFD
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * Approximate retained size of an event. A JS object's real heap footprint is
 * not measurable from JS, so we use the UTF-8 length of its serialized form:
 * stable, cheap, and dominated by the body content that actually drives memory.
 */
export function estimateBytes(event: DebugEvent): number {
  return utf8ByteLength(JSON.stringify(event));
}
