/**
 * Seed data for exercising Loupe's storage panel.
 *
 * The panel only lists what a real backend reports, so the example app
 * installs both optional peers (AsyncStorage and MMKV) and writes the same
 * record into each. Two populated adapters is also the only way to exercise
 * the panel's adapter switcher.
 *
 * @format
 */

/**
 * Values chosen to stress the panel rather than to look realistic. Tidy data
 * hides truncation, escaping, and empty-vs-null bugs; each entry below is one
 * of those hiding places.
 */
export const SEED: ReadonlyArray<readonly [key: string, value: string]> = [
  ['seed:short', 'hello'],

  // Multi-line, nested, and quoted — the detail view renders raw strings, so
  // the newlines and inner quotes must survive a write/read round trip.
  [
    'seed:json',
    JSON.stringify(
      {user: {id: 42, name: 'Amanda', roles: ['admin', 'dev']}, active: true},
      null,
      2,
    ),
  ],

  // ~50KB. Big enough to catch a panel that renders the whole value eagerly.
  ['seed:large', 'x'.repeat(50 * 1024)],

  ['seed:unicode', '🔍 放大镜 عدسة مكبرة ✨ café'],

  // Empty string, not absent. StorageAdapter.get returns `string | null`, so
  // a panel that treats '' as "missing" is wrong in a way only this catches.
  ['seed:empty', ''],

  ['seed:multiline', Array.from({length: 20}, (_, i) => `line ${i + 1}`).join('\n')],

  // A key long enough to overflow the key list's layout.
  [`seed:${'long-key-segment-'.repeat(12)}end`, 'short value under a very long key'],

  ['seed:quotes', 'has "double" and \'single\' quotes, a \\ backslash, and a\nnewline'],
];

const PREFIXES = {asyncStorage: 'as:', mmkv: 'mmkv:'} as const;

/**
 * Both backends are pulled in lazily rather than imported at module scope.
 * `example/__tests__/App.test.tsx` renders App under Jest with no native
 * runtime attached, and a top-level import of either module would break that
 * test. It also mirrors how Loupe itself defers its optional peers.
 */
function loadAsyncStorage() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('@react-native-async-storage/async-storage');
  return m.default ?? m;
}

function loadKeychain() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('react-native-keychain');
}

function loadMmkv() {
  // v4 exposes createMMKV(); v2 and v3 exposed an MMKV class.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('react-native-mmkv');
  return typeof m.createMMKV === 'function' ? m.createMMKV() : new m.MMKV();
}

/**
 * Runs one backend's writes, reporting failure instead of throwing.
 *
 * Each backend is isolated so a missing or broken native module on one still
 * leaves the other seeded — with both wired up, a single throw would
 * otherwise leave the panel half-populated and the cause invisible. The
 * report goes through console.error on purpose: Loupe captures it, so the
 * failure shows up in the log panel next door.
 */
async function runBackend(label: string, write: () => Promise<void>): Promise<boolean> {
  try {
    await write();
    return true;
  } catch (e) {
    console.error(`storage-seed: ${label} failed`, e);
    return false;
  }
}

/** Writes the seed record into every backend that works. */
export async function seedStorage(): Promise<void> {
  const results = await Promise.all([
    runBackend('AsyncStorage', async () => {
      const store = loadAsyncStorage();
      for (const [key, value] of SEED) {
        await store.setItem(PREFIXES.asyncStorage + key, value);
      }
    }),
    runBackend('MMKV', async () => {
      const store = loadMmkv();
      for (const [key, value] of SEED) {
        store.set(PREFIXES.mmkv + key, value);
      }
    }),
  ]);

  // Deliberately unmistakable as fakes. They keep the shape of a credential so
  // the panel's masking is worth looking at, without putting anything in a
  // public repo that reads like a leaked token to a human or a secret scanner.
  //
  // Only two entries: Keychain writes go
  // through the secure enclave and are markedly slower than a plain key/value
  // store, and the point here is to have something to look at in the panel,
  // not to stress it.
  const keychainOk = await runBackend('Keychain', async () => {
    const Keychain = loadKeychain();
    await Keychain.setGenericPassword('amanda', 'not-a-real-token-51H8xQ2', {
      service: 'api.example.com',
    });
    await Keychain.setGenericPassword('refresh', 'not-a-real-refresh-9f3c1a77b2', {
      service: 'auth.example.com',
    });
  });

  const ok = results.filter(Boolean).length + (keychainOk ? 1 : 0);
  console.log(`storage-seed: seeded ${SEED.length} keys into ${ok}/3 backends`);
}

/** Removes only the seeded keys, leaving anything else in storage alone. */
export async function clearSeed(): Promise<void> {
  await Promise.all([
    runBackend('AsyncStorage', async () => {
      const store = loadAsyncStorage();
      for (const [key] of SEED) {
        await store.removeItem(PREFIXES.asyncStorage + key);
      }
    }),
    runBackend('MMKV', async () => {
      const store = loadMmkv();
      for (const [key] of SEED) {
        // v4 renamed delete() to remove().
        const k = PREFIXES.mmkv + key;
        if (typeof store.remove === 'function') store.remove(k);
        else store.delete(k);
      }
    }),
  ]);

  await runBackend('Keychain', async () => {
    const Keychain = loadKeychain();
    for (const service of ['api.example.com', 'auth.example.com']) {
      await Keychain.resetGenericPassword({service});
    }
  });

  console.log('storage-seed: cleared seeded keys');
}
