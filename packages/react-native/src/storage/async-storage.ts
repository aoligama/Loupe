import type { StorageAdapter } from './types';

interface AsyncStorageLike {
  getAllKeys(): Promise<readonly string[]>;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

export function createAsyncStorageAdapter(module: unknown): StorageAdapter {
  const m = module as { default?: AsyncStorageLike } & AsyncStorageLike;
  const store: AsyncStorageLike = m.default ?? m;

  return {
    id: 'async-storage',
    label: 'AsyncStorage',
    list: async () => [...(await store.getAllKeys())],
    get: (key) => store.getItem(key),
    set: (key, value) => store.setItem(key, value),
    delete: (key) => store.removeItem(key),
    clear: () => store.clear(),
  };
}
