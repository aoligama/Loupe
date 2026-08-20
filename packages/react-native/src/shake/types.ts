import type { Subscription } from '@loupe/contract';

export interface ShakeSource {
  id: string;
  onShake(cb: () => void): Subscription;
}

export interface ShakeOptions {
  /** Acceleration magnitude in g that counts as a hit. */
  threshold?: number;
  /** Hits required inside the window before firing. */
  requiredHits?: number;
  /** Rolling window in ms over which hits accumulate. */
  windowMs?: number;
  /** Quiet period in ms after a fire. */
  debounceMs?: number;
}
