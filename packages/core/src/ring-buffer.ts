import type { DebugEvent } from '@loupe/contract';
import { estimateBytes } from './bytes';
import type { BufferConfig } from './config';

interface Entry {
  event: DebugEvent;
  bytes: number;
  key: string | null;
}

/**
 * Walk a dotted path such as "payload.requestId". Returns null unless the path
 * resolves to a NON-EMPTY string, in which case the caller falls back to append.
 *
 * Both exclusions are deliberate. A non-string id (a number, say) falling back
 * to append means a plugin using numeric ids gets duplicate rows rather than
 * silent misbehaviour. An empty key is almost always a bug in the emitting
 * plugin — an uninitialized field, a failed id generation — and accepting it
 * would collapse every such event into one record with no dropped-count
 * accounting, so the events would vanish with nothing to show they existed.
 */
function resolveKey(event: DebugEvent, keyPath: string): string | null {
  try {
    let node: unknown = event;
    for (const segment of keyPath.split('.')) {
      if (node === null || typeof node !== 'object') return null;
      node = (node as Record<string, unknown>)[segment];
    }
    return typeof node === 'string' && node !== '' ? node : null;
  } catch {
    // This walk is the SECOND read of a payload the emit path only proved safe
    // for one: a stateful getter can survive serialization and throw here.
    // Falling back to append beats throwing into the app being debugged.
    // Ports note: Kotlin and Swift walk a typed map, so this catch is a no-op
    // there — it exists because JS property access can run arbitrary code.
    return null;
  }
}

export class RingBuffer {
  private entries: Entry[] = [];
  private bytes = 0;
  private dropped = 0;

  constructor(private readonly config: BufferConfig) {}

  get size(): number {
    return this.entries.length;
  }

  get byteSize(): number {
    return this.bytes;
  }

  get droppedCount(): number {
    return this.dropped;
  }

  /**
   * `bytes` may be supplied by a caller that has already serialized the event,
   * so the emit path serializes exactly once. Defaults to measuring here.
   */
  add(event: DebugEvent, bytes: number = estimateBytes(event)): void {
    const key =
      this.config.strategy.kind === 'upsertByKey'
        ? resolveKey(event, this.config.strategy.keyPath)
        : null;

    if (key !== null && this.replaceInPlace(key, event, bytes)) {
      this.evict();
      return;
    }

    this.entries.push({ event, bytes, key });
    this.bytes += bytes;
    this.evict();
  }

  list(): DebugEvent[] {
    return this.entries.map((e) => e.event);
  }

  clear(): void {
    this.entries = [];
    this.bytes = 0;
    this.dropped = 0;
  }

  /**
   * Amendment A1: an existing key is updated at its current index. A network
   * list that reshuffles as responses land is unreadable, so first-insert
   * position wins and eviction stays insertion-ordered.
   */
  private replaceInPlace(key: string, event: DebugEvent, bytes: number): boolean {
    const index = this.entries.findIndex((e) => e.key === key);
    if (index === -1) return false;

    const previous = this.entries[index]!;
    this.entries[index] = { event, bytes, key };
    this.bytes += bytes - previous.bytes;
    return true;
  }

  /**
   * Evict oldest-first until under both caps. Never evicts the last remaining
   * entry: a single event larger than the whole budget is still worth showing,
   * and dropping it would leave the panel silently empty.
   */
  private evict(): void {
    while (
      this.entries.length > 1 &&
      (this.entries.length > this.config.countCap || this.bytes > this.config.byteBudget)
    ) {
      const removed = this.entries.shift();
      if (!removed) break;
      this.bytes -= removed.bytes;
      this.dropped += 1;
    }
  }
}
