import { createLinkStore, LINKS_KEY } from '../src/deeplink/links';
import type { StorageAdapter } from '../src/storage/types';

function fakeAdapter(seed: Record<string, string> = {}): StorageAdapter & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    map,
    id: 'fake',
    label: 'Fake',
    list: async () => [...map.keys()],
    get: async (k) => map.get(k) ?? null,
    set: async (k, v) => { map.set(k, v); },
    delete: async (k) => { map.delete(k); },
    clear: async () => { map.clear(); },
  };
}

describe('createLinkStore', () => {
  it('starts empty when storage holds nothing', async () => {
    const store = createLinkStore([fakeAdapter()]);
    expect(await store.list()).toEqual([]);
  });

  it('persists an added link under LINKS_KEY as a JSON array', async () => {
    const adapter = fakeAdapter();
    const store = createLinkStore([adapter]);

    await store.add('loupeexample://a');

    expect(JSON.parse(adapter.map.get(LINKS_KEY)!)).toEqual(['loupeexample://a']);
  });

  it('reads back links written by a previous session', async () => {
    const adapter = fakeAdapter({ [LINKS_KEY]: JSON.stringify(['loupeexample://a']) });
    expect(await createLinkStore([adapter]).list()).toEqual(['loupeexample://a']);
  });

  it('ignores an exact duplicate', async () => {
    const store = createLinkStore([fakeAdapter()]);
    await store.add('loupeexample://a');
    await store.add('loupeexample://a');
    expect(await store.list()).toEqual(['loupeexample://a']);
  });

  it('treats links differing only by trailing slash as distinct', async () => {
    // Not an oversight: that difference is often the thing under test.
    const store = createLinkStore([fakeAdapter()]);
    await store.add('loupeexample://a');
    await store.add('loupeexample://a/');
    expect(await store.list()).toHaveLength(2);
  });

  it('removes a link', async () => {
    const store = createLinkStore([fakeAdapter()]);
    await store.add('loupeexample://a');
    await store.add('loupeexample://b');
    await store.remove('loupeexample://a');
    expect(await store.list()).toEqual(['loupeexample://b']);
  });

  it('treats a malformed stored value as empty instead of throwing', async () => {
    // A corrupt value must not wedge the panel shut; it offers no way to repair
    // storage, so throwing here would be a dead end for the user.
    const adapter = fakeAdapter({ [LINKS_KEY]: 'not json at all' });
    expect(await createLinkStore([adapter]).list()).toEqual([]);
  });

  it('treats a JSON value of the wrong shape as empty', async () => {
    const adapter = fakeAdapter({ [LINKS_KEY]: JSON.stringify({ nope: true }) });
    expect(await createLinkStore([adapter]).list()).toEqual([]);
  });

  it('drops non-string entries from a stored array', async () => {
    const adapter = fakeAdapter({ [LINKS_KEY]: JSON.stringify(['ok', 42, null]) });
    expect(await createLinkStore([adapter]).list()).toEqual(['ok']);
  });

  it('works in memory when no adapter is available', async () => {
    const store = createLinkStore([]);
    await store.add('loupeexample://a');
    expect(await store.list()).toEqual(['loupeexample://a']);
  });

  it('does not throw when the adapter fails to write', async () => {
    const adapter = fakeAdapter();
    adapter.set = async () => { throw new Error('disk full'); };
    const store = createLinkStore([adapter]);

    await expect(store.add('loupeexample://a')).resolves.toBeUndefined();
    // The link is still usable this session even though it did not persist.
    expect(await store.list()).toEqual(['loupeexample://a']);
  });
});
