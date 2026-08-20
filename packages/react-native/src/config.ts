import type { BufferConfig } from '@loupe/core';
import type { ShakeOptions, ShakeSource } from './shake/types';
import type { StorageAdapter } from './storage/types';

/**
 * Lives in its own module so both entry points can describe the same shape
 * without either importing the other, and without dragging the implementation
 * in: this file is types only and erases at compile time.
 */
export interface LoupeConfig {
  /** Show the draggable bubble. Default true. */
  bubble?: boolean;
  /**
   * false disables shake entirely; an object tunes the detector. Default true.
   *
   * Loupe cannot supply a sensor itself — see detectShakeSource. Without a
   * `source` it installs the dev-menu fallback, which needs nothing installed.
   * In a release build that fallback does nothing, so pass `false` there unless
   * you are supplying a source.
   */
  shake?: boolean | (ShakeOptions & { source?: ShakeSource });
  /** Per-body capture cap in bytes. Default 262144. */
  bodyCapBytes?: number;
  /** Per-type ring buffer overrides. */
  buffers?: Record<string, Partial<BufferConfig>>;
  /**
   * Storage backends to show in the storage panel. Loupe requires none of them
   * itself — see the comment on detectStorageAdapters — so the host builds them
   * with createAsyncStorageAdapter, createMmkvAdapter or createKeychainAdapter
   * and passes them in.
   */
  storageAdapters?: StorageAdapter[];
}
