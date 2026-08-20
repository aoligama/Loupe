import type { ShakeOptions } from './types';

export interface AccelerometerSample {
  x: number;
  y: number;
  z: number;
}

const DEFAULTS = {
  threshold: 1.8,
  requiredHits: 3,
  windowMs: 500,
  debounceMs: 1000,
};

/**
 * Turns a raw accelerometer stream into shake events. Kept on our side of the
 * adapter boundary so sensitivity stays tunable regardless of which sensor
 * package the host installed.
 */
export class ShakeDetector {
  private readonly options: Required<ShakeOptions>;
  private hits: number[] = [];
  private lastFiredAt = -Infinity;

  constructor(options: ShakeOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  push(sample: AccelerometerSample, now: number): boolean {
    if (now - this.lastFiredAt < this.options.debounceMs) return false;

    const magnitude = Math.sqrt(sample.x ** 2 + sample.y ** 2 + sample.z ** 2);
    if (magnitude < this.options.threshold) return false;

    this.hits.push(now);
    this.hits = this.hits.filter((t) => now - t <= this.options.windowMs);

    if (this.hits.length < this.options.requiredHits) return false;

    this.lastFiredAt = now;
    this.hits = [];
    return true;
  }

  reset(): void {
    this.hits = [];
  }
}
