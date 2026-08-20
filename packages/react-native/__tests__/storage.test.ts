import { createAsyncStorageAdapter } from '../src/storage/async-storage';
import { createMmkvAdapter } from '../src/storage/mmkv';

describe('AsyncStorage adapter', () => {
  const store = new Map<string, string>();
  const module = {
    default: {
      getAllKeys: async () => Array.from(store.keys()),
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => { store.set(k, v); },
      removeItem: async (k: string) => { store.delete(k); },
      clear: async () => { store.clear(); },
    },
  };

  beforeEach(() => {
    store.clear();
    store.set('user:42', '{"name":"a"}');
  });

  it('identifies itself', () => {
    const a = createAsyncStorageAdapter(module);
    expect(a.id).toBe('async-storage');
    expect(a.label).toBe('AsyncStorage');
  });

  it('lists keys', async () => {
    await expect(createAsyncStorageAdapter(module).list()).resolves.toEqual(['user:42']);
  });

  it('reads a value and returns null for a missing key', async () => {
    const a = createAsyncStorageAdapter(module);
    await expect(a.get('user:42')).resolves.toBe('{"name":"a"}');
    await expect(a.get('nope')).resolves.toBeNull();
  });

  it('writes, deletes, and clears', async () => {
    const a = createAsyncStorageAdapter(module);
    await a.set('k', 'v');
    await expect(a.get('k')).resolves.toBe('v');
    await a.delete('k');
    await expect(a.get('k')).resolves.toBeNull();
    await a.clear();
    await expect(a.list()).resolves.toEqual([]);
  });

  it('accepts a module exported without a default wrapper', async () => {
    const a = createAsyncStorageAdapter(module.default);
    await expect(a.list()).resolves.toEqual(['user:42']);
  });
});

describe('MMKV adapter', () => {
  class FakeMMKV {
    private data = new Map<string, string>([['token', 'abc']]);
    getAllKeys() { return Array.from(this.data.keys()); }
    getString(k: string) { return this.data.get(k); }
    set(k: string, v: string) { this.data.set(k, v); }
    delete(k: string) { this.data.delete(k); }
    clearAll() { this.data.clear(); }
  }

  const module = { MMKV: FakeMMKV };

  it('identifies itself', () => {
    expect(createMmkvAdapter(module).id).toBe('mmkv');
    expect(createMmkvAdapter(module).label).toBe('MMKV');
  });

  it('lists keys and reads values from the synchronous API', async () => {
    const a = createMmkvAdapter(module);
    await expect(a.list()).resolves.toEqual(['token']);
    await expect(a.get('token')).resolves.toBe('abc');
  });

  it('normalizes a missing key to null rather than undefined', async () => {
    await expect(createMmkvAdapter(module).get('nope')).resolves.toBeNull();
  });

  it('writes, deletes, and clears', async () => {
    const a = createMmkvAdapter(module);
    await a.set('k', 'v');
    await expect(a.get('k')).resolves.toBe('v');
    await a.delete('k');
    await expect(a.get('k')).resolves.toBeNull();
    await a.clear();
    await expect(a.list()).resolves.toEqual([]);
  });
});

// v4 dropped the MMKV class for a createMMKV() factory and renamed delete() to
// remove(). Both versions are supported: a debug tool has no business dictating
// which one the host is on.
describe('createMmkvAdapter against MMKV v4', () => {
  class FakeV4Instance {
    data = new Map<string, string>([['token', 'abc']]);
    getAllKeys() { return Array.from(this.data.keys()); }
    getString(k: string) { return this.data.get(k); }
    set(k: string, v: string) { this.data.set(k, v); }
    // No delete() at all — this is what a v4 instance actually looks like.
    remove(k: string) { return this.data.delete(k); }
    clearAll() { this.data.clear(); }
  }

  const v4 = () => ({ createMMKV: () => new FakeV4Instance() });

  it('constructs through createMMKV rather than new MMKV', async () => {
    // The regression that shipped: destructuring MMKV from a v4 module yields
    // undefined, and `new undefined()` throws "Cannot read property 'prototype'
    // of undefined" — caught by the caller, leaving the adapter silently absent.
    const a = createMmkvAdapter(v4());
    await expect(a.list()).resolves.toEqual(['token']);
  });

  it('deletes through remove(), which is the only name v4 offers', async () => {
    const a = createMmkvAdapter(v4());
    await a.delete('token');
    await expect(a.list()).resolves.toEqual([]);
  });

  it('reads, writes and clears the same as v3', async () => {
    const a = createMmkvAdapter(v4());
    await expect(a.get('token')).resolves.toBe('abc');
    await expect(a.get('nope')).resolves.toBeNull();
    await a.set('k', 'v');
    await expect(a.get('k')).resolves.toBe('v');
    await a.clear();
    await expect(a.list()).resolves.toEqual([]);
  });

  it('prefers createMMKV when a module somehow exposes both', async () => {
    class Old { getAllKeys() { return ['old']; } getString() { return undefined; }
      set() {} delete() {} clearAll() {} }
    const both = { createMMKV: () => new FakeV4Instance(), MMKV: Old };

    await expect(createMmkvAdapter(both).list()).resolves.toEqual(['token']);
  });

  it('explains itself when the module is neither shape', () => {
    // Better than `new undefined()`: the previous failure gave no hint that a
    // version mismatch was the cause.
    expect(() => createMmkvAdapter({ nope: true })).toThrow(/createMMKV.*MMKV/);
  });
});
