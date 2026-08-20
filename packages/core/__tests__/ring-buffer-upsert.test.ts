import { RingBuffer } from '../src/ring-buffer';
import { estimateBytes } from '../src/bytes';
import type { DebugEvent } from '@loupe/contract';

function net(id: string, requestId: string, status: string, extra: object = {}): DebugEvent {
  return {
    schemaVersion: 1,
    id,
    type: 'network',
    timestamp: 0,
    sourcePluginId: 'network',
    payload: { requestId, status, ...extra },
  };
}

const UPSERT = {
  strategy: { kind: 'upsertByKey', keyPath: 'payload.requestId' } as const,
  countCap: 3,
  byteBudget: 1_000_000,
};

describe('RingBuffer, upsertByKey strategy', () => {
  it('keeps one record per key', () => {
    const b = new RingBuffer(UPSERT);
    b.add(net('e1', 'r1', 'pending'));
    b.add(net('e2', 'r1', 'success'));
    expect(b.size).toBe(1);
  });

  it('replaces the record with the latest emit', () => {
    const b = new RingBuffer(UPSERT);
    b.add(net('e1', 'r1', 'pending'));
    b.add(net('e2', 'r1', 'success'));
    const only = b.list()[0]!;
    expect(only.id).toBe('e2');
    expect((only.payload as { status: string }).status).toBe('success');
  });

  it('does NOT reorder on update — position is fixed at first insert (amendment A1)', () => {
    const b = new RingBuffer(UPSERT);
    b.add(net('e1', 'r1', 'pending'));
    b.add(net('e2', 'r2', 'pending'));
    b.add(net('e3', 'r3', 'pending'));
    b.add(net('e4', 'r1', 'success')); // r1 completes last

    expect(b.list().map((e) => (e.payload as { requestId: string }).requestId))
      .toEqual(['r1', 'r2', 'r3']);
    // Position held AND the newer content landed — without this the test
    // cannot tell "replaced in place" from "left stale in place".
    expect(b.list()[0]!.id).toBe('e4');
  });

  it('does not count an update as an eviction', () => {
    const b = new RingBuffer(UPSERT);
    b.add(net('e1', 'r1', 'pending'));
    b.add(net('e2', 'r1', 'success'));
    expect(b.droppedCount).toBe(0);
  });

  it('adjusts byteSize when a replacement is a different size', () => {
    const b = new RingBuffer(UPSERT);
    b.add(net('e1', 'r1', 'pending'));
    const small = b.byteSize;
    b.add(net('e2', 'r1', 'success', { body: 'x'.repeat(500) }));
    const large = b.byteSize;
    expect(large).toBeGreaterThan(small);

    b.add(net('e3', 'r1', 'success'));
    expect(b.byteSize).toBeLessThan(large);
  });

  it('evicts the oldest key when the count cap is exceeded', () => {
    const b = new RingBuffer(UPSERT);
    ['r1', 'r2', 'r3', 'r4'].forEach((r, i) => b.add(net(`e${i}`, r, 'pending')));
    expect(b.list().map((e) => (e.payload as { requestId: string }).requestId))
      .toEqual(['r2', 'r3', 'r4']);
    expect(b.droppedCount).toBe(1);
  });

  it('keeps byteSize exactly equal to the retained entry after a replace', () => {
    const b = new RingBuffer(UPSERT);
    const complete = net('e2', 'r1', 'success', { body: 'x'.repeat(300) });

    b.add(net('e1', 'r1', 'pending'));
    b.add(complete);

    // Directional assertions would pass even if the arithmetic were subtly
    // wrong; pin the exact invariant instead.
    expect(b.byteSize).toBe(estimateBytes(complete));
  });

  it('evicts the oldest key when a replacement pushes it over the byte budget', () => {
    const grown = net('e3', 'r2', 'success', { body: 'x'.repeat(400) });
    const budget = estimateBytes(grown) + 10;
    const b = new RingBuffer({
      strategy: { kind: 'upsertByKey', keyPath: 'payload.requestId' },
      countCap: 100,
      byteBudget: budget,
    });

    b.add(net('e1', 'r1', 'pending'));
    b.add(net('e2', 'r2', 'pending'));
    b.add(grown);

    expect(b.list().map((e) => (e.payload as { requestId: string }).requestId)).toEqual(['r2']);
    expect(b.droppedCount).toBe(1);
    expect(b.byteSize).toBe(estimateBytes(grown));
  });

  it('clear empties an upsert buffer, resets dropped count, and stays usable', () => {
    const b = new RingBuffer(UPSERT);
    ['r1', 'r2', 'r3', 'r4'].forEach((r, i) => b.add(net(`e${i}`, r, 'pending')));
    expect(b.droppedCount).toBe(1);

    b.clear();
    expect(b.list()).toEqual([]);
    expect(b.droppedCount).toBe(0);
    expect(b.byteSize).toBe(0);

    b.add(net('e9', 'r9', 'pending'));
    expect(b.size).toBe(1);
  });

  it('falls back to append for a non-string key', () => {
    const b = new RingBuffer(UPSERT);
    const numeric = (id: string): DebugEvent => ({
      schemaVersion: 1, id, type: 'network', timestamp: 0,
      sourcePluginId: 'network', payload: { requestId: 42 },
    });

    b.add(numeric('e1'));
    b.add(numeric('e2'));
    expect(b.size).toBe(2);
  });

  it('falls back to append for an empty-string key rather than merging records', () => {
    const b = new RingBuffer(UPSERT);
    b.add(net('e1', '', 'pending'));
    b.add(net('e2', '', 'pending'));

    // Merging here would make both events vanish into one record with
    // droppedCount still 0 — invisible loss, the worst kind.
    expect(b.size).toBe(2);
    expect(b.droppedCount).toBe(0);
  });

  it('falls back to append when the keyPath does not resolve', () => {
    const b = new RingBuffer(UPSERT);
    const keyless: DebugEvent = {
      schemaVersion: 1, id: 'e1', type: 'network', timestamp: 0,
      sourcePluginId: 'network', payload: { noRequestId: true },
    };
    b.add(keyless);
    b.add({ ...keyless, id: 'e2' });
    expect(b.size).toBe(2);
  });
});
