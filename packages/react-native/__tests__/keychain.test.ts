import { createKeychainAdapter } from '../src/storage/keychain';

interface Entry { username: string; password: string }

function fakeKeychain(seed: Record<string, Entry> = {}) {
  const store = new Map(Object.entries(seed));
  const calls: {listOptions: unknown[]} = {listOptions: []};
  return {
    store,
    calls,
    getAllGenericPasswordServices: async (options?: unknown) => {
      calls.listOptions.push(options);
      return [...store.keys()];
    },
    getGenericPassword: async ({service}: {service: string}) => store.get(service) ?? false,
    setGenericPassword: async (username: string, password: string, {service}: {service: string}) => {
      store.set(service, {username, password});
    },
    resetGenericPassword: async ({service}: {service: string}) => {
      store.delete(service);
    },
  };
}

describe('createKeychainAdapter', () => {
  it('marks itself sensitive so the panel masks its values', () => {
    // The whole reason the flag exists: these are tokens, not app data.
    expect(createKeychainAdapter(fakeKeychain()).sensitive).toBe(true);
  });

  it('lists services as keys', async () => {
    const kc = fakeKeychain({ 'api.example.com': {username: 'me', password: 'tok'} });
    expect(await createKeychainAdapter(kc).list()).toEqual(['api.example.com']);
  });

  it('skips UI auth when listing, so opening the panel cannot trigger Face ID', async () => {
    const kc = fakeKeychain();
    await createKeychainAdapter(kc).list();
    expect(kc.calls.listOptions[0]).toEqual({skipUIAuth: true});
  });

  it('returns the credential pair as pretty JSON', async () => {
    const kc = fakeKeychain({ svc: {username: 'me', password: 'tok'} });
    expect(await createKeychainAdapter(kc).get('svc'))
      .toBe('{\n  "username": "me",\n  "password": "tok"\n}');
  });

  it('returns null for a service with no entry', async () => {
    // react-native-keychain resolves `false`, not null, for a miss.
    expect(await createKeychainAdapter(fakeKeychain()).get('absent')).toBeNull();
  });

  it('round-trips an edited JSON pair', async () => {
    const kc = fakeKeychain({ svc: {username: 'me', password: 'old'} });
    const a = createKeychainAdapter(kc);

    await a.set('svc', JSON.stringify({username: 'you', password: 'new'}));

    expect(kc.store.get('svc')).toEqual({username: 'you', password: 'new'});
  });

  it('treats a raw non-JSON edit as the password and keeps the username', async () => {
    // Someone selects all, pastes a token and saves. Losing that edit to a
    // parse error, or writing "[object Object]" into a credential store, are
    // both worse than assuming they meant the password.
    const kc = fakeKeychain({ svc: {username: 'me', password: 'old'} });

    await createKeychainAdapter(kc).set('svc', 'a-raw-token');

    expect(kc.store.get('svc')).toEqual({username: 'me', password: 'a-raw-token'});
  });

  it('treats JSON without a password field as a raw value', async () => {
    const kc = fakeKeychain({ svc: {username: 'me', password: 'old'} });

    await createKeychainAdapter(kc).set('svc', '{"unrelated":1}');

    expect(kc.store.get('svc')).toEqual({username: 'me', password: '{"unrelated":1}'});
  });

  it('deletes one service', async () => {
    const kc = fakeKeychain({ a: {username: '', password: '1'}, b: {username: '', password: '2'} });
    await createKeychainAdapter(kc).delete('a');
    expect([...kc.store.keys()]).toEqual(['b']);
  });

  it('clears every service, since Keychain has no bulk API', async () => {
    const kc = fakeKeychain({ a: {username: '', password: '1'}, b: {username: '', password: '2'} });
    await createKeychainAdapter(kc).clear();
    expect(kc.store.size).toBe(0);
  });

  it('accepts a module exposing its API under default', async () => {
    const kc = fakeKeychain({ svc: {username: 'me', password: 'tok'} });
    expect(await createKeychainAdapter({default: kc}).list()).toEqual(['svc']);
  });
});
