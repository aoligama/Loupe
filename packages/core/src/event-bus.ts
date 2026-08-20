import { SCHEMA_VERSION } from '@loupe/contract';
import type { DebugEvent, Subscription } from '@loupe/contract';
import { RingBuffer } from './ring-buffer';
import { utf8ByteLength } from './bytes';
import { DEFAULT_BUFFERS, DEFAULT_CUSTOM_BUFFER, DEFAULT_MAX_TYPES } from './config';
import type { BufferConfig } from './config';

export interface EventBus {
  emit(event: DebugEvent): void;
  subscribe(type: string, listener: (e: DebugEvent) => void): Subscription;
  history(type: string): DebugEvent[];
  clear(type: string): void;
  droppedCount(type: string): number;
  /** Events rejected because the distinct-type cap was reached (amendment A5). */
  typeCapRejections(): number;
  /** Events that could not be handled at all and were dropped (amendment A6). */
  malformedEventCount(): number;
}

type Listener = (e: DebugEvent) => void;

interface Storable {
  event: DebugEvent;
  bytes: number;
}

/** String() itself throws on a null-prototype value, so even this needs a net. */
function safeString(value: unknown, fallback: string): string {
  try {
    return String(value);
  } catch {
    return fallback;
  }
}

function safeNumber(value: unknown): number {
  try {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function unserializableMarker(cause: unknown): Record<string, string> {
  let reason = 'unknown';
  try {
    // Both halves can throw: a Proxy with a throwing getPrototypeOf trap makes
    // `instanceof` throw, and an Error subclass can define `message` as a
    // throwing getter. Argument evaluation happens before any callee's guard,
    // so passing these into a "safe" helper would not have protected them —
    // the whole expression has to sit inside this try.
    reason = String(cause instanceof Error ? cause.message : cause);
  } catch {
    // Keep the default. A recovery path that can fail recovers nothing.
  }
  return { loupeError: 'payload is not JSON-serializable', reason };
}

/**
 * Serialize the event exactly ONCE and never throw.
 *
 * Two things force this shape. First, plugin payloads are arbitrary caller
 * data: a circular structure or a BigInt makes JSON.stringify throw, and a
 * debug tool must never crash the app it is observing. Second, serializing to
 * *check* and then letting the store serialize again to *measure* is not
 * equivalent to checking — a payload with a stateful getter or toJSON can
 * succeed on the first call and throw on the second, so the second call has to
 * be the same call. Measuring here and handing the size to RingBuffer.add is
 * what makes the guarantee real, and it saves a full pass over every body.
 *
 * Replacing rather than dropping keeps the failure visible in the panel, and
 * the store then only ever holds events that can actually cross the wire.
 */
function toStorable(event: DebugEvent): Storable {
  try {
    return { event, bytes: utf8ByteLength(JSON.stringify(event)) };
  } catch (cause) {
    const marked: DebugEvent = { ...event, payload: unserializableMarker(cause) };
    try {
      return { event: marked, bytes: utf8ByteLength(JSON.stringify(marked)) };
    } catch {
      // Something outside `payload` is unserializable too. emit() is reachable
      // from untyped JS, so the envelope's own fields cannot be trusted either.
      // Rebuild from coerced primitives, which cannot fail to serialize.
      const minimal: DebugEvent = {
        schemaVersion: SCHEMA_VERSION,
        id: safeString(event.id, 'unknown'),
        type: safeString(event.type, 'unknown'),
        timestamp: safeNumber(event.timestamp),
        sourcePluginId: safeString(event.sourcePluginId, 'unknown'),
        payload: unserializableMarker(cause),
      };
      return { event: minimal, bytes: utf8ByteLength(JSON.stringify(minimal)) };
    }
  }
}

export class DebugEventBus implements EventBus {
  private buffers = new Map<string, RingBuffer>();
  private listeners = new Map<string, Set<Listener>>();

  private rejected = 0;
  private malformed = 0;
  private readonly maxTypes: number;

  constructor(
    private readonly overrides: Record<string, Partial<BufferConfig>> = {},
    maxTypes: number = DEFAULT_MAX_TYPES,
  ) {
    // A NaN or negative cap would make `size >= maxTypes` false forever,
    // silently disabling the very bound A5 exists to guarantee. Clamp.
    this.maxTypes =
      Number.isFinite(maxTypes) && maxTypes > 0 ? Math.floor(maxTypes) : DEFAULT_MAX_TYPES;
  }

  emit(event: DebugEvent): void {
    let safe: DebugEvent;

    try {
      // Amendment A2: the shell stamps schemaVersion; the producer never wins.
      // The spread lives INSIDE the guard because it is itself a read of every
      // envelope field, and a hostile getter there would fire before any other
      // protection existed.
      const stamped: DebugEvent = { ...event, schemaVersion: SCHEMA_VERSION };

      // One serialization, one truth. `bytes` is measured from the exact string
      // that proved the event serializable, so the store never re-serializes.
      const storable = toStorable(stamped);
      safe = storable.event;

      this.bufferFor(safe.type)?.add(safe, storable.bytes);
    } catch {
      // Outermost net. Every known route is guarded at its source above; this
      // exists so that an unknown one still cannot reach the app being
      // debugged. Counted rather than swallowed, so it is visible instead of
      // merely absent.
      this.malformed += 1;
      return;
    }

    // Live subscribers see every emit, including both halves of a network pair.
    // Coalescing applies only to what the store retains. Note subscribers are
    // notified even when the type cap rejected the event from the store: a
    // live panel showing it is strictly better than silence.
    const set = this.listeners.get(safe.type);
    if (!set) return;
    for (const listener of Array.from(set)) {
      // The snapshot above keeps iteration safe against mutation, but a
      // listener disposed by an earlier listener in this same emit must not
      // still be called — a React panel would get a callback after unmount.
      if (!set.has(listener)) continue;
      try {
        listener(safe);
      } catch {
        // A panel that throws must not break capture or starve sibling panels.
      }
    }
  }

  typeCapRejections(): number {
    return this.rejected;
  }

  malformedEventCount(): number {
    return this.malformed;
  }

  subscribe(type: string, listener: Listener): Subscription {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    this.listeners.set(type, set);
    set.add(listener);
    return {
      dispose: () => {
        set.delete(listener);
      },
    };
  }

  history(type: string): DebugEvent[] {
    return this.buffers.get(type)?.list() ?? [];
  }

  clear(type: string): void {
    this.buffers.get(type)?.clear();
  }

  droppedCount(type: string): number {
    return this.buffers.get(type)?.droppedCount ?? 0;
  }

  /**
   * Returns null once the distinct-type cap is reached. No console warning:
   * this file is mirrored line-for-line into Kotlin and Swift, where there is
   * no console — the rejection is surfaced through typeCapRejections() so every
   * platform reports it the same way.
   */
  private bufferFor(type: string): RingBuffer | null {
    const existing = this.buffers.get(type);
    if (existing) return existing;

    if (this.buffers.size >= this.maxTypes) {
      this.rejected += 1;
      return null;
    }

    const buffer = new RingBuffer(this.configFor(type));
    this.buffers.set(type, buffer);
    return buffer;
  }

  private configFor(type: string): BufferConfig {
    const base =
      type === 'log' || type === 'network' ? DEFAULT_BUFFERS[type] : DEFAULT_CUSTOM_BUFFER;
    // Spread order matters: an override may set caps without losing the
    // built-in retention strategy.
    return { ...base, ...this.overrides[type] };
  }
}
