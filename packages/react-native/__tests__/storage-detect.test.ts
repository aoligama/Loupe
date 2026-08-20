// Loupe no longer probes for storage backends. Requiring an absent optional
// peer throws uncaught under Metro — it took the storage panel down for any app
// that had not installed the package, which is most of them. Backends now come
// from the host, whose own import is static and always resolvable.
//
// These tests pin that contract: nothing is detected on its own, and whatever
// the host registers is what the panel sees.

import { detectStorageAdapters, registerStorageAdapters } from '../src/storage/detect';
import type { StorageAdapter } from '../src/storage/types';

function fake(id: string): StorageAdapter {
  return {
    id,
    label: id,
    list: async () => [],
    get: async () => null,
    set: async () => {},
    delete: async () => {},
    clear: async () => {},
  };
}

afterEach(() => registerStorageAdapters([]));

describe('detectStorageAdapters', () => {
  it('finds nothing on its own, and does not throw doing so', () => {
    // The path that runs in every app that wires no backend. It must be inert:
    // the previous version reached a require() here and crashed the panel.
    expect(() => detectStorageAdapters()).not.toThrow();
    expect(detectStorageAdapters()).toEqual([]);
  });

  it('returns the adapters the host registered', () => {
    registerStorageAdapters([fake('async-storage'), fake('keychain')]);

    expect(detectStorageAdapters().map((a) => a.id)).toEqual(['async-storage', 'keychain']);
  });

  it('preserves the order the host gave, since the first becomes the active tab', () => {
    registerStorageAdapters([fake('keychain'), fake('async-storage')]);

    expect(detectStorageAdapters()[0]!.id).toBe('keychain');
  });

  it('replaces rather than accumulates, so a reconfiguring startLoupe cannot double up', () => {
    registerStorageAdapters([fake('a')]);
    registerStorageAdapters([fake('b')]);

    expect(detectStorageAdapters().map((x) => x.id)).toEqual(['b']);
  });

  it('hands back a copy, so a caller cannot mutate the registry', () => {
    registerStorageAdapters([fake('a')]);

    detectStorageAdapters().push(fake('sneaky'));

    expect(detectStorageAdapters().map((x) => x.id)).toEqual(['a']);
  });
});
