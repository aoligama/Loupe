import { utf8ByteLength, estimateBytes } from '../src/bytes';
import type { DebugEvent } from '@loupe/contract';

describe('utf8ByteLength', () => {
  it('counts ASCII as one byte each', () => {
    expect(utf8ByteLength('hello')).toBe(5);
  });

  it('counts two-byte sequences', () => {
    expect(utf8ByteLength('é')).toBe(2);
  });

  it('counts three-byte sequences', () => {
    expect(utf8ByteLength('☃')).toBe(3);
  });

  it('counts astral-plane characters as four bytes, not two', () => {
    expect(utf8ByteLength('😀')).toBe(4);
  });

  // Every case above is a single character, which is exactly how a loop-index
  // bug hides. These exercise what happens *after* the surrogate branch.
  it('keeps counting correctly after a surrogate pair', () => {
    expect(utf8ByteLength('a😀b')).toBe(6);
  });

  it('treats a lone high surrogate as U+FFFD without swallowing the next character', () => {
    expect(utf8ByteLength('\uD800☃')).toBe(6);
    expect(utf8ByteLength('\uD800')).toBe(3);
  });

  it('treats a lone low surrogate as U+FFFD', () => {
    expect(utf8ByteLength('\uDC00')).toBe(3);
  });

  it('handles an empty string', () => {
    expect(utf8ByteLength('')).toBe(0);
  });
});

describe('estimateBytes', () => {
  const event: DebugEvent = {
    schemaVersion: 1,
    id: 'a',
    type: 'log',
    timestamp: 0,
    sourcePluginId: 'log',
    payload: { message: 'hi' },
  };

  it('matches the UTF-8 length of the serialized event', () => {
    expect(estimateBytes(event)).toBe(utf8ByteLength(JSON.stringify(event)));
  });

  it('grows with payload size', () => {
    const big: DebugEvent = { ...event, payload: { message: 'x'.repeat(1000) } };
    expect(estimateBytes(big)).toBeGreaterThan(estimateBytes(event) + 900);
  });
});
