import type { StorageAdapter } from './types';

interface MMKVInstance {
  getAllKeys(): string[];
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  clearAll(): void;
  /** v2 and v3. */
  delete?(key: string): void;
  /** v4 renamed it, and made it report whether anything was removed. */
  remove?(key: string): boolean;
}

interface MmkvModule {
  /** v4. */
  createMMKV?: () => MMKVInstance;
  /** v2 and v3. */
  MMKV?: new () => MMKVInstance;
}

/**
 * v4 dropped the `MMKV` class in favour of a `createMMKV()` factory. Both are
 * supported because a debug tool has no business dictating which version the
 * host is on, and the two differ only at construction and in one method name.
 *
 * Getting this wrong is quiet rather than loud: destructuring `MMKV` from a v4
 * module yields undefined, and `new undefined()` throws "Cannot read property
 * 'prototype' of undefined" — which the caller catches, leaving the adapter
 * simply absent with no indication why.
 */
function instantiate(module: unknown): MMKVInstance {
  const m = (module ?? {}) as MmkvModule;

  if (typeof m.createMMKV === 'function') return m.createMMKV();
  if (typeof m.MMKV === 'function') return new m.MMKV();

  throw new Error(
    'Loupe: react-native-mmkv exports neither createMMKV (v4) nor MMKV (v2/v3).',
  );
}

export function createMmkvAdapter(module: unknown): StorageAdapter {
  const store = instantiate(module);

  return {
    id: 'mmkv',
    label: 'MMKV',
    list: async () => store.getAllKeys(),
    get: async (key) => store.getString(key) ?? null,
    set: async (key, value) => {
      store.set(key, value);
    },
    delete: async (key) => {
      // v4 calls it remove; v2 and v3 call it delete. Check for the v4 name
      // first: a v4 instance has no `delete` at all, so the order only matters
      // if a future version keeps both, in which case the newer name wins.
      if (typeof store.remove === 'function') {
        store.remove(key);
        return;
      }
      if (typeof store.delete === 'function') {
        store.delete(key);
        return;
      }
      throw new Error('Loupe: this MMKV instance exposes neither remove() nor delete().');
    },
    clear: async () => {
      store.clearAll();
    },
  };
}
