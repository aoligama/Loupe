import type { StorageAdapter } from './types';

/**
 * Loupe deliberately requires no storage backend of its own.
 *
 * Auto-detection used to `require()` each optional peer inside a try block.
 * Under Metro that is not safe: an absent optional dependency's slot in the
 * module's dependency map is `undefined`, and reaching the require throws
 * "Requiring unknown module undefined" — uncaught, escaping the very try that
 * marked the dependency optional. It took the storage panel down for any app
 * without the peer, which is most of them.
 *
 * Gating on the native module first does not rescue it either. The legacy
 * NativeModules proxy reports nothing at all under the New Architecture, and
 * TurboModuleRegistry needs a per-package module name that cannot be verified
 * for a package that is not installed — the name for AsyncStorage was already
 * wrong on the first attempt, which would have meant silently never detecting
 * a backend that was present.
 *
 * So the host supplies them. Their import is static, Metro resolves it
 * normally, and the dependency belongs to the app that installed it:
 *
 *   import { startLoupe, createAsyncStorageAdapter } from 'react-native-loupe';
 *   import AsyncStorage from '@react-native-async-storage/async-storage';
 *   startLoupe({ storageAdapters: [createAsyncStorageAdapter(AsyncStorage)] });
 */
let injected: StorageAdapter[] = [];

/**
 * Adapters supplied by the host app, shown alongside the auto-detected ones.
 *
 * This is how a backend Loupe cannot safely probe for gets in. Auto-detection
 * requires a module that may not exist, and under Metro an absent optional
 * dependency does not fail softly — the require throws an uncaught error that
 * takes the panel down. A host importing the package itself has no such
 * problem: the import is static, Metro resolves it normally, and the
 * dependency belongs to the app that actually installed it.
 */
export function registerStorageAdapters(adapters: StorageAdapter[]): void {
  injected = adapters;
}

export function detectStorageAdapters(): StorageAdapter[] {
  return [...injected];
}
