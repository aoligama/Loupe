import { DebugEventBus } from '../src/event-bus';
import type { DebugEvent } from '@loupe/contract';

function evt(over: Partial<DebugEvent> = {}): DebugEvent {
  return {
    schemaVersion: 1, id: 'e1', type: 'log', timestamp: 0,
    sourcePluginId: 'log', payload: { m: 'hi' }, ...over,
  };
}

describe('DebugEventBus', () => {
  it('stamps schemaVersion, overwriting the producer (amendment A2)', () => {
    const bus = new DebugEventBus();
    bus.emit(evt({ schemaVersion: 99 }));
    expect(bus.history('log')[0]!.schemaVersion).toBe(1);
  });

  it('replaces a circular payload with a marker instead of throwing', () => {
    const bus = new DebugEventBus();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => bus.emit(evt({ payload: cyclic }))).not.toThrow();
    const stored = bus.history('log')[0]!.payload as { loupeError?: string };
    expect(stored.loupeError).toMatch(/not JSON-serializable/i);
  });

  it('replaces a BigInt payload with a marker', () => {
    const bus = new DebugEventBus();
    expect(() => bus.emit(evt({ payload: { big: BigInt(1) } }))).not.toThrow();
    const stored = bus.history('log')[0]!.payload as { loupeError?: string };
    expect(stored.loupeError).toBeDefined();
  });

  it('delivers the sanitized payload to subscribers, not the original', () => {
    const bus = new DebugEventBus();
    const seen: DebugEvent[] = [];
    bus.subscribe('log', (e) => seen.push(e));

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    bus.emit(evt({ payload: cyclic }));

    expect((seen[0]!.payload as { loupeError?: string }).loupeError).toBeDefined();
  });

  it('leaves a serializable payload untouched', () => {
    const bus = new DebugEventBus();
    const payload = { m: 'hi', nested: { n: 1 } };
    bus.emit(evt({ payload }));
    expect(bus.history('log')[0]!.payload).toEqual(payload);
  });

  it('survives a payload that serializes once and then throws', () => {
    // The reason the guard must BE the measurement rather than precede it: a
    // check-then-measure design passes this payload and throws on the measure.
    const bus = new DebugEventBus();
    let calls = 0;
    const payload = {
      get trap() {
        calls += 1;
        if (calls > 1) throw new Error('second call boom');
        return 'ok';
      },
    };

    expect(() => bus.emit(evt({ payload }))).not.toThrow();
    expect(bus.history('log')).toHaveLength(1);
  });

  it('survives a thrown value that String() cannot convert', () => {
    // A null-prototype throwable makes String(e) throw inside the recovery
    // path — a crash guard that crashes while recovering guards nothing.
    const bus = new DebugEventBus();
    const hostile = Object.create(null) as Record<string, unknown>;
    const payload = {
      get trap(): never {
        throw hostile;
      },
    };

    expect(() => bus.emit(evt({ payload }))).not.toThrow();
    const stored = bus.history('log')[0]!.payload as { loupeError?: string; reason?: string };
    expect(stored.loupeError).toMatch(/not JSON-serializable/i);
    expect(typeof stored.reason).toBe('string');
  });

  it('survives an unserializable value outside the payload', () => {
    // emit() is reachable from untyped JS, so the envelope's own fields cannot
    // be trusted either.
    const bus = new DebugEventBus();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => bus.emit(evt({ id: cyclic as unknown as string }))).not.toThrow();
    expect(bus.history('log')).toHaveLength(1);
    expect(typeof bus.history('log')[0]!.id).toBe('string');
  });

  it('stops creating buffers once the distinct-type cap is reached', () => {
    const bus = new DebugEventBus({}, 2);
    bus.emit(evt({ type: 'a' }));
    bus.emit(evt({ type: 'b' }));
    bus.emit(evt({ type: 'c' }));
    bus.emit(evt({ type: 'd' }));

    expect(bus.history('a')).toHaveLength(1);
    expect(bus.history('b')).toHaveLength(1);
    expect(bus.history('c')).toEqual([]);
    expect(bus.typeCapRejections()).toBe(2);
  });

  it('keeps accepting events for types already admitted after the cap is hit', () => {
    const bus = new DebugEventBus({}, 1);
    bus.emit(evt({ type: 'a', id: 'e1' }));
    bus.emit(evt({ type: 'b', id: 'e2' }));
    bus.emit(evt({ type: 'a', id: 'e3' }));

    expect(bus.history('a').map((e) => e.id)).toEqual(['e1', 'e3']);
    expect(bus.typeCapRejections()).toBe(1);
  });

  it('threads a real byte size into the store, not a placeholder', () => {
    // Nothing else pins the VALUE that toStorable measures — every other test
    // would still pass if it returned 0. Byte-budget eviction is the only
    // observable that depends on the number being real.
    const bus = new DebugEventBus({ log: { byteBudget: 1200 } });

    bus.emit(evt({ id: 'e1', payload: { m: 'hi' } }));
    bus.emit(evt({ id: 'e2', payload: { blob: 'x'.repeat(2000) } }));

    expect(bus.history('log').map((e) => e.id)).toEqual(['e2']);
    expect(bus.droppedCount('log')).toBe(1);
  });

  it('survives an Error whose message getter throws', () => {
    const bus = new DebugEventBus();
    class Boom extends Error {
      override get message(): string {
        throw new Error('message getter');
      }
    }
    const payload = {
      get trap(): never {
        throw new Boom();
      },
    };

    expect(() => bus.emit(evt({ payload }))).not.toThrow();
    expect(bus.history('log')).toHaveLength(1);
  });

  it('survives a throwing getter on an envelope field', () => {
    const bus = new DebugEventBus();
    const hostile = { type: 'log', payload: {} } as unknown as DebugEvent;
    Object.defineProperty(hostile, 'sourcePluginId', {
      get() {
        throw new Error('envelope getter');
      },
      enumerable: true,
    });

    expect(() => bus.emit(hostile)).not.toThrow();
    expect(bus.malformedEventCount()).toBe(1);
  });

  it('survives a stateful getter on the upsert key', () => {
    // The network path reads payload.requestId a second time, in resolveKey,
    // after serialization already consumed the first read.
    const bus = new DebugEventBus();
    let reads = 0;
    const payload = {
      status: 'pending',
      get requestId(): string {
        reads += 1;
        if (reads > 1) throw new Error('second read');
        return 'r1';
      },
    };

    expect(() => bus.emit(evt({ type: 'network', payload }))).not.toThrow();
    expect(bus.history('network')).toHaveLength(1);
    expect(bus.malformedEventCount()).toBe(0);
  });

  it('reports zero malformed events for well-formed input', () => {
    const bus = new DebugEventBus();
    bus.emit(evt());
    expect(bus.malformedEventCount()).toBe(0);
  });

  it('ignores a nonsense type cap rather than silently disabling the bound', () => {
    const bus = new DebugEventBus({}, Number.NaN);
    bus.emit(evt({ type: 'a' }));
    expect(bus.history('a')).toHaveLength(1);
    expect(bus.typeCapRejections()).toBe(0);
  });

  it('reports zero rejections when under the cap', () => {
    const bus = new DebugEventBus();
    bus.emit(evt());
    expect(bus.typeCapRejections()).toBe(0);
  });

  it('still notifies live subscribers for a type the cap rejected', () => {
    const bus = new DebugEventBus({}, 1);
    const seen: DebugEvent[] = [];
    bus.emit(evt({ type: 'a' }));
    bus.subscribe('b', (e) => seen.push(e));

    bus.emit(evt({ type: 'b' }));
    expect(seen).toHaveLength(1);
    expect(bus.history('b')).toEqual([]);
  });

  it('does not call a listener disposed by an earlier listener in the same emit', () => {
    const bus = new DebugEventBus();
    const seen: string[] = [];
    let second: { dispose(): void };

    bus.subscribe('log', () => {
      seen.push('first');
      second.dispose();
    });
    second = bus.subscribe('log', () => seen.push('second'));

    bus.emit(evt());
    expect(seen).toEqual(['first']);
  });

  it('delivers to subscribers of the matching type only', () => {
    const bus = new DebugEventBus();
    const logs: DebugEvent[] = [];
    const nets: DebugEvent[] = [];
    bus.subscribe('log', (e) => logs.push(e));
    bus.subscribe('network', (e) => nets.push(e));

    bus.emit(evt());
    expect(logs).toHaveLength(1);
    expect(nets).toHaveLength(0);
  });

  it('delivers BOTH pending and complete network emits to live subscribers', () => {
    const bus = new DebugEventBus();
    const seen: string[] = [];
    bus.subscribe('network', (e) => seen.push((e.payload as { status: string }).status));

    bus.emit(evt({ type: 'network', id: 'a', payload: { requestId: 'r1', status: 'pending' } }));
    bus.emit(evt({ type: 'network', id: 'b', payload: { requestId: 'r1', status: 'success' } }));

    expect(seen).toEqual(['pending', 'success']);
    expect(bus.history('network')).toHaveLength(1); // coalesced in the store
  });

  it('stops delivering after dispose', () => {
    const bus = new DebugEventBus();
    const seen: DebugEvent[] = [];
    const sub = bus.subscribe('log', (e) => seen.push(e));
    bus.emit(evt());
    sub.dispose();
    bus.emit(evt({ id: 'e2' }));
    expect(seen).toHaveLength(1);
  });

  it('isolates a throwing listener from the others', () => {
    const bus = new DebugEventBus();
    const seen: DebugEvent[] = [];
    bus.subscribe('log', () => { throw new Error('panel bug'); });
    bus.subscribe('log', (e) => seen.push(e));
    expect(() => bus.emit(evt())).not.toThrow();
    expect(seen).toHaveLength(1);
  });

  it('returns history oldest to newest', () => {
    const bus = new DebugEventBus();
    bus.emit(evt({ id: 'a' }));
    bus.emit(evt({ id: 'b' }));
    expect(bus.history('log').map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('gives an unknown type the custom append strategy, not network upsert', () => {
    // A bare "history has 1 entry" assertion would pass for any non-broken
    // config. Proving two events sharing a requestId do NOT coalesce is what
    // actually pins DEFAULT_CUSTOM_BUFFER to `append`.
    const bus = new DebugEventBus();
    bus.emit(evt({ type: 'my-plugin', id: 'e1', payload: { requestId: 'r1' } }));
    bus.emit(evt({ type: 'my-plugin', id: 'e2', payload: { requestId: 'r1' } }));

    expect(bus.history('my-plugin').map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('returns an empty history and zero drops for a type never emitted', () => {
    const bus = new DebugEventBus();
    expect(bus.history('nope')).toEqual([]);
    expect(bus.droppedCount('nope')).toBe(0);
  });

  it('honours per-type cap overrides', () => {
    const bus = new DebugEventBus({ log: { countCap: 2 } });
    ['a', 'b', 'c'].forEach((id) => bus.emit(evt({ id })));
    expect(bus.history('log').map((e) => e.id)).toEqual(['b', 'c']);
    expect(bus.droppedCount('log')).toBe(1);
  });

  it('keeps the network upsert strategy when overriding only its byte budget', () => {
    const bus = new DebugEventBus({ network: { byteBudget: 1024 * 1024 } });
    bus.emit(evt({ type: 'network', id: 'a', payload: { requestId: 'r1', status: 'pending' } }));
    bus.emit(evt({ type: 'network', id: 'b', payload: { requestId: 'r1', status: 'success' } }));
    expect(bus.history('network')).toHaveLength(1);
  });

  it('clear empties one type and resets its dropped count, leaving others alone', () => {
    const bus = new DebugEventBus({ log: { countCap: 1 } });
    bus.emit(evt({ id: 'a' }));
    bus.emit(evt({ id: 'b' }));
    bus.emit(evt({ type: 'network', payload: { requestId: 'r1' } }));
    expect(bus.droppedCount('log')).toBe(1);

    bus.clear('log');
    expect(bus.history('log')).toEqual([]);
    expect(bus.droppedCount('log')).toBe(0);
    expect(bus.history('network')).toHaveLength(1);
  });
});
