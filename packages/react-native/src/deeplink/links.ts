import type { StorageAdapter } from '../storage/types';
import { detectStorageAdapters } from '../storage/detect';

export const LINKS_KEY = 'loupe:deeplinks';

export interface LinkStore {
  list(): Promise<string[]>;
  add(url: string): Promise<void>;
  remove(url: string): Promise<void>;
}

/**
 * Anything but an array of strings is treated as an empty list. The panel
 * offers no way to repair storage, so throwing on a corrupt value would leave
 * the user with a permanently broken tool and no route out of it.
 */
function parse(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

/**
 * The configured deep links.
 *
 * Persists through whichever storage backend Loupe already detected for the
 * storage panel, and falls back to memory when there is none — the tool must
 * work in an app with no storage peer, just without surviving a reload.
 *
 * The cached array is the source of truth for the session. Writes update it
 * first and persist second, so a storage failure costs persistence but never
 * the link you just added.
 */
export function createLinkStore(adapters?: StorageAdapter[]): LinkStore {
  const available = adapters ?? detectStorageAdapters();
  const backend: StorageAdapter | null = available[0] ?? null;

  let cache: string[] | null = null;

  async function load(): Promise<string[]> {
    if (cache !== null) return cache;
    if (!backend) {
      cache = [];
      return cache;
    }
    try {
      cache = parse(await backend.get(LINKS_KEY));
    } catch {
      // A backend that throws on read is indistinguishable from an empty one
      // as far as this tool is concerned.
      cache = [];
    }
    return cache;
  }

  async function persist(next: string[]): Promise<void> {
    cache = next;
    if (!backend) return;
    try {
      await backend.set(LINKS_KEY, JSON.stringify(next));
    } catch {
      // Already in cache; persistence is best-effort.
    }
  }

  return {
    list: async () => [...(await load())],

    add: async (url) => {
      const current = await load();
      // Exact-match dedupe only. Two URLs differing by a trailing slash or
      // query order are different links, because that difference is routinely
      // the thing being tested.
      if (current.includes(url)) return;
      await persist([...current, url]);
    },

    remove: async (url) => {
      const current = await load();
      await persist(current.filter((u) => u !== url));
    },
  };
}
