import type { Body } from '@loupe/contract';
import { utf8ByteLength } from '@loupe/core';

export const DEFAULT_BODY_CAP_BYTES = 262144; // 256 KB

export const EMPTY_BODY: Body = {
  content: null,
  encoding: 'none',
  size: 0,
  truncated: false,
  mimeType: null,
};

const TEXT_MIME = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded)|.*\+json)/i;

function isTextual(mimeType: string | null): boolean {
  // An absent content-type is treated as text: the common case for a body we
  // already hold as a string, and base64ing readable JSON helps nobody.
  return mimeType === null || TEXT_MIME.test(mimeType);
}

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : undefined;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : undefined;

    out += CHARS[a >> 2];
    out += CHARS[((a & 0x03) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : CHARS[((b & 0x0f) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : CHARS[c & 0x3f];
  }
  return out;
}

/**
 * Encode a string to UTF-8 bytes. Mirrors utf8ByteLength exactly, including
 * counting an unpaired surrogate as U+FFFD (3 bytes), so the produced bytes and
 * the reported `size` can never disagree.
 */
function utf8Bytes(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      } else {
        code = 0xfffd; // unpaired high surrogate
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      code = 0xfffd; // unpaired low surrogate
    }

    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

/** Bytes of a buffer or a view, honoring a view's window into a larger buffer. */
function viewBytes(raw: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
}

/**
 * Longest prefix of `s` whose UTF-8 length is <= cap, cut on a code-point
 * boundary so a multi-byte character is never split. The cap is a BYTE budget;
 * truncating by character would let multi-byte text through at several times
 * the cap and defeat the ring buffer's byte accounting.
 */
function truncateTextToBytes(s: string, cap: number): { content: string; truncated: boolean } {
  let bytes = 0;
  for (let i = 0; i < s.length; ) {
    const cp = s.codePointAt(i)!;
    const charBytes = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + charBytes > cap) return { content: s.slice(0, i), truncated: true };
    bytes += charBytes;
    i += cp > 0xffff ? 2 : 1;
  }
  return { content: s, truncated: false };
}

/** Truncate on BYTES, then encode, so the retained base64 is always valid. */
function binaryBody(bytes: Uint8Array, cap: number, mimeType: string | null): Body {
  const size = bytes.length;
  const truncated = size > cap;
  const slice = truncated ? bytes.subarray(0, cap) : bytes;
  return { content: toBase64(slice), encoding: 'base64', size, truncated, mimeType };
}

function textBody(text: string, cap: number, mimeType: string | null): Body {
  const size = utf8ByteLength(text);
  const { content, truncated } = truncateTextToBytes(text, cap);
  return { content, encoding: 'utf8', size, truncated, mimeType };
}

/**
 * Bound and describe a request or response body. Never throws: a debug tool
 * that crashes the request it is observing is worse than no debug tool.
 */
export function captureBody(
  raw: unknown,
  mimeType: string | null,
  cap: number = DEFAULT_BODY_CAP_BYTES,
): Body {
  if (raw === null || raw === undefined || raw === '') {
    return { ...EMPTY_BODY, mimeType };
  }

  // Binary input is always base64, regardless of mime. Truncate the bytes,
  // then encode — encoding first and slicing the string would produce base64
  // that is both mis-sized against the cap and not decodable.
  if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
    const bytes = viewBytes(raw as ArrayBuffer | ArrayBufferView);
    if (bytes.length === 0) return { ...EMPTY_BODY, mimeType };
    return binaryBody(bytes, cap, mimeType);
  }

  let text: string;
  if (typeof raw === 'string') {
    text = raw;
  } else {
    try {
      const json = JSON.stringify(raw);
      if (json === undefined) return { ...EMPTY_BODY, mimeType };
      text = json;
    } catch {
      return { ...EMPTY_BODY, mimeType };
    }
  }

  // A non-text mime on a string body: encode its real UTF-8 bytes, not a
  // charCodeAt & 0xff approximation that would corrupt anything above U+00FF.
  if (!isTextual(mimeType)) {
    return binaryBody(utf8Bytes(text), cap, mimeType);
  }

  return textBody(text, cap, mimeType);
}
