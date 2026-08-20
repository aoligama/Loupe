/**
 * @format
 */

import {clearSeed, SEED, seedStorage} from '../storage-seed';

// Jest only permits out-of-scope references inside a module factory when the
// name starts with `mock`. The factories run lazily — storage-seed requires
// its backends inside the functions, not at module scope — so these bindings
// are initialised by the time a factory reads them.
const mockAsyncItems = new Map<string, string>();
const mockMmkvItems = new Map<string, string>();
let mockAsyncFails = false;
let mockMmkvFails = false;

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: async (key: string, value: string) => {
      if (mockAsyncFails) {
        throw new Error('AsyncStorage native module missing');
      }
      mockAsyncItems.set(key, value);
    },
    removeItem: async (key: string) => {
      if (mockAsyncFails) {
        throw new Error('AsyncStorage native module missing');
      }
      mockAsyncItems.delete(key);
    },
  },
}));

jest.mock('react-native-mmkv', () => ({
  // MMKV throws at construction when the native side is absent, which is the
  // real-world failure this fake reproduces.
  MMKV: class {
    constructor() {
      if (mockMmkvFails) {
        throw new Error('MMKV native module missing');
      }
    }
    set(key: string, value: string) {
      mockMmkvItems.set(key, value);
    }
    delete(key: string) {
      mockMmkvItems.delete(key);
    }
  },
}));

beforeEach(() => {
  mockAsyncItems.clear();
  mockMmkvItems.clear();
  mockAsyncFails = false;
  mockMmkvFails = false;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the seed record', () => {
  // The point of the seed set is the awkward values. A well-meaning tidy-up
  // that replaced them with neat strings would leave the panel untested
  // without failing anything else, so pin the awkwardness down here.
  it('keeps the edge cases that make it worth seeding', () => {
    const byKey = new Map(SEED);

    expect(byKey.get('seed:empty')).toBe('');
    expect(byKey.get('seed:large')!.length).toBeGreaterThan(40 * 1024);
    expect(byKey.get('seed:multiline')).toContain('\n');
    expect(byKey.get('seed:json')).toContain('\n');
    expect(byKey.get('seed:quotes')).toContain('"');
    expect(byKey.get('seed:quotes')).toContain('\\');
    expect(SEED.some(([key]) => key.length > 150)).toBe(true);
  });

  it('has no duplicate keys', () => {
    expect(new Set(SEED.map(([key]) => key)).size).toBe(SEED.length);
  });
});

describe('seedStorage', () => {
  it('writes every entry into both backends under a per-backend prefix', async () => {
    await seedStorage();

    expect(mockAsyncItems.size).toBe(SEED.length);
    expect(mockMmkvItems.size).toBe(SEED.length);
    expect([...mockAsyncItems.keys()].every(k => k.startsWith('as:'))).toBe(true);
    expect([...mockMmkvItems.keys()].every(k => k.startsWith('mmkv:'))).toBe(true);
  });

  it('round-trips each value unchanged', async () => {
    await seedStorage();

    for (const [key, value] of SEED) {
      expect(mockAsyncItems.get(`as:${key}`)).toBe(value);
      expect(mockMmkvItems.get(`mmkv:${key}`)).toBe(value);
    }
  });

  // The behaviour most likely to regress silently: with two backends wired up,
  // one throwing must not leave the other unseeded and the cause invisible.
  it('still seeds AsyncStorage when MMKV throws', async () => {
    mockMmkvFails = true;

    await seedStorage();

    expect(mockAsyncItems.size).toBe(SEED.length);
    expect(mockMmkvItems.size).toBe(0);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('MMKV'),
      expect.anything(),
    );
  });

  it('still seeds MMKV when AsyncStorage throws', async () => {
    mockAsyncFails = true;

    await seedStorage();

    expect(mockMmkvItems.size).toBe(SEED.length);
    expect(mockAsyncItems.size).toBe(0);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('AsyncStorage'),
      expect.anything(),
    );
  });

  it('resolves rather than rejecting when both backends are broken', async () => {
    mockAsyncFails = true;
    mockMmkvFails = true;

    await expect(seedStorage()).resolves.toBeUndefined();
  });
});

describe('clearSeed', () => {
  it('removes the seeded keys and leaves everything else alone', async () => {
    await seedStorage();
    mockAsyncItems.set('as:not-seeded', 'keep me');
    mockMmkvItems.set('mmkv:not-seeded', 'keep me');

    await clearSeed();

    expect(mockAsyncItems.size).toBe(1);
    expect(mockMmkvItems.size).toBe(1);
    expect(mockAsyncItems.get('as:not-seeded')).toBe('keep me');
    expect(mockMmkvItems.get('mmkv:not-seeded')).toBe('keep me');
  });
});
