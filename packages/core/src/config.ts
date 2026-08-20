export type RetentionStrategy =
  | { kind: 'append' }
  | { kind: 'upsertByKey'; keyPath: string };

export interface BufferConfig {
  strategy: RetentionStrategy;
  countCap: number;
  byteBudget: number;
}

const MB = 1024 * 1024;

export const DEFAULT_BUFFERS: Record<'log' | 'network', BufferConfig> = {
  log: { strategy: { kind: 'append' }, countCap: 2000, byteBudget: 8 * MB },
  network: {
    strategy: { kind: 'upsertByKey', keyPath: 'payload.requestId' },
    countCap: 500,
    byteBudget: 32 * MB,
  },
};

export const DEFAULT_CUSTOM_BUFFER: BufferConfig = {
  strategy: { kind: 'append' },
  countCap: 1000,
  byteBudget: 8 * MB,
};

/**
 * Maximum number of distinct event types the store will hold buffers for.
 *
 * Without this the per-type byte budgets bound nothing in aggregate: a plugin
 * that puts a request id or timestamp into `event.type` would create one
 * permanently-retained buffer per emit, and the documented ~48 MB ceiling would
 * be a claim rather than a guarantee.
 */
export const DEFAULT_MAX_TYPES = 64;
