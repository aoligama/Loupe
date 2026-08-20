import type { StorageAdapter } from './types';

interface Credentials {
  username: string;
  password: string;
}

interface KeychainLike {
  getAllGenericPasswordServices(options?: { skipUIAuth?: boolean }): Promise<string[]>;
  getGenericPassword(options: { service: string }): Promise<Credentials | false>;
  setGenericPassword(
    username: string,
    password: string,
    options: { service: string },
  ): Promise<unknown>;
  resetGenericPassword(options: { service: string }): Promise<unknown>;
}

/**
 * Keychain stores a username and a password per service; Loupe's adapter is
 * string-to-string. The value is therefore the pair, as JSON — CodeBlock
 * already pretty-prints it, and nothing about the entry stays hidden from the
 * reader, which matters when the username is itself meaningful.
 */
function encode(c: Credentials): string {
  return JSON.stringify({ username: c.username, password: c.password }, null, 2);
}

/**
 * Tolerant of a hand-edited value that is no longer the JSON pair.
 *
 * Someone who selects everything, types a raw token and saves means "this is
 * the password" — losing their edit to a parse error, or writing the literal
 * text `[object Object]` into a credential store, are both worse than
 * assuming that. An existing username is preserved so a raw edit cannot
 * silently blank it.
 */
function decode(value: string, previous: Credentials | null): Credentials {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed !== null && typeof parsed === 'object') {
      const o = parsed as Partial<Credentials>;
      if (typeof o.password === 'string') {
        return {
          username: typeof o.username === 'string' ? o.username : (previous?.username ?? ''),
          password: o.password,
        };
      }
    }
  } catch {
    // Not JSON: fall through and treat the whole string as the password.
  }
  return { username: previous?.username ?? '', password: value };
}

export function createKeychainAdapter(module: unknown): StorageAdapter {
  const m = module as { default?: KeychainLike } & KeychainLike;
  const api: KeychainLike = m.default ?? m;

  // skipUIAuth so that merely opening the storage panel cannot trigger a Face
  // ID prompt for every biometric-protected entry. Those entries are listed;
  // reading one still prompts, which is the right moment to ask.
  const services = () => api.getAllGenericPasswordServices({ skipUIAuth: true });

  const read = async (service: string): Promise<Credentials | null> => {
    const found = await api.getGenericPassword({ service });
    return found === false ? null : found;
  };

  return {
    id: 'keychain',
    label: 'Keychain',
    // Marks every value in this adapter as a secret. The panel masks them
    // until explicitly revealed — these are auth tokens and credentials, and
    // Loupe renders them on screen in dev builds that get screen-shared.
    sensitive: true,
    list: services,
    get: async (service) => {
      const found = await read(service);
      return found === null ? null : encode(found);
    },
    set: async (service, value) => {
      const next = decode(value, await read(service));
      await api.setGenericPassword(next.username, next.password, { service });
    },
    delete: async (service) => {
      await api.resetGenericPassword({ service });
    },
    clear: async () => {
      // No bulk API. Sequential rather than parallel: a keychain write storm
      // is exactly the kind of thing that surfaces flaky native behaviour, and
      // this runs once behind a confirmation.
      for (const service of await services()) {
        await api.resetGenericPassword({ service });
      }
    },
  };
}
