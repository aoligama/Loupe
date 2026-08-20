import { RingBuffer } from '../src/ring-buffer';
import { estimateBytes } from '../src/bytes';
import type { DebugEvent } from '@loupe/contract';

function evt(id: string, payload: unknown = { m: id }): DebugEvent {
  return { schemaVersion: 1, id, type: 'log', timestamp: 0, sourcePluginId: 'log', payload };
}

const APPEND = { strategy: { kind: 'append' } as const, countCap: 3, byteBudget: 1_000_000 };

describe('RingBuffer, append strategy', () => {
  it('returns entries oldest to newest', () => {
    const b = new RingBuffer(APPEND);
    b.add(evt('a'));
    b.add(evt('b'));
    expect(b.list().map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('evicts the oldest when the count cap is exceeded', () => {
    const b = new RingBuffer(APPEND);
    ['a', 'b', 'c', 'd'].forEach((id) => b.add(evt(id)));
    expect(b.list().map((e) => e.id)).toEqual(['b', 'c', 'd']);
    expect(b.size).toBe(3);
  });

  it('counts evictions in droppedCount', () => {
    const b = new RingBuffer(APPEND);
    ['a', 'b', 'c', 'd', 'e'].forEach((id) => b.add(evt(id)));
    expect(b.droppedCount).toBe(2);
  });

  it('evicts on the byte budget even when under the count cap', () => {
    const one = evt('a', { m: 'x'.repeat(500) });
    const budget = estimateBytes(one) * 2 + 10;
    const b = new RingBuffer({ strategy: { kind: 'append' }, countCap: 100, byteBudget: budget });

    b.add(evt('a', { m: 'x'.repeat(500) }));
    b.add(evt('b', { m: 'x'.repeat(500) }));
    b.add(evt('c', { m: 'x'.repeat(500) }));

    expect(b.size).toBe(2);
    expect(b.list().map((e) => e.id)).toEqual(['b', 'c']);
    expect(b.byteSize).toBeLessThanOrEqual(budget);
  });

  it('keeps a single oversized event rather than evicting into emptiness', () => {
    const b = new RingBuffer({ strategy: { kind: 'append' }, countCap: 100, byteBudget: 10 });
    b.add(evt('a', { m: 'x'.repeat(500) }));
    expect(b.size).toBe(1);
  });

  it('tracks byteSize down as well as up', () => {
    const b = new RingBuffer(APPEND);
    b.add(evt('a'));
    const after = b.byteSize;
    expect(after).toBeGreaterThan(0);
    b.clear();
    expect(b.byteSize).toBe(0);
  });

  it('clear empties the buffer and resets droppedCount', () => {
    const b = new RingBuffer(APPEND);
    ['a', 'b', 'c', 'd'].forEach((id) => b.add(evt(id)));
    expect(b.droppedCount).toBe(1);
    b.clear();
    expect(b.list()).toEqual([]);
    expect(b.droppedCount).toBe(0);
  });
});
