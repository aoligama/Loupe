import React from 'react';
import type { EventBus } from '@loupe/core';
import type { LoupeConfig } from './config';
import type { StorageAdapter, ShakeSource } from './types-public';

/**
 * The development entry point. Everything it can reach is gated behind
 * `__DEV__`, so a release build of a host app ships none of it.
 *
 * The implementation lives in ./impl, which contains no gating at all and is
 * required lazily from inside each `if (__DEV__)` block below. Metro inlines
 * `__DEV__` to false and constant-folds dead branches BEFORE it collects a
 * file's dependency graph, so in a release build these requires are never
 * reached and ./impl — with the event bus, capture, overlay and panels behind
 * it — never enters the bundle. scripts/verify-release-strip.sh proves it.
 *
 * Two shapes matter here and both are load-bearing:
 *
 *   - The require must sit INSIDE `if (__DEV__) { ... }`, never after an
 *     `if (!__DEV__) return` guard. Metro only deletes the body of a folded
 *     block; code following a negated guard stays textually present and its
 *     requires are still collected. Written the wrong way once, and the
 *     release bundle grew by 1.5KB while the marker check stayed green.
 *   - Nothing may be imported from ./impl at module scope. A single top-level
 *     import undoes all of the above.
 *
 * A host that wants the overlay in a release build imports
 * 'react-native-loupe/release' instead, which is the same API with no gating.
 */

export type { LoupeConfig } from './config';

export function getBus(): EventBus | null {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./impl').getBus();
  }
  return null;
}

export function stopLoupe(): void {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('./impl').stopLoupe();
  }
}

/**
 * Called automatically on import in __DEV__. Call it again with a config to
 * reconfigure: the previous capture is torn down first, so it is safe to run
 * from the host's own startup code.
 */
export function startLoupe(config: LoupeConfig = {}): void {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('./impl').startLoupe(config);
  }
}

interface LoupeRootProps {
  bus: EventBus;
  showBubble?: boolean;
  children?: React.ReactNode;
}

/**
 * Fallback wrapper for hosts whose AppRegistry wrapper slot is already taken.
 * Outside __DEV__ this is a transparent passthrough.
 */
export function LoupeRoot(props: LoupeRootProps): React.ReactElement {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Impl = require('./impl');
    return <Impl.LoupeRoot {...props} />;
  }
  return <>{props.children}</>;
}

/** Imperative entry point for triggers that live outside React. Dev-only. */
export function openOverlay(): void {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('./impl').openOverlay();
  }
}

/** Dev-only counterpart to openOverlay. */
export function closeOverlay(): void {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('./impl').closeOverlay();
  }
}

/**
 * Build a storage adapter over @react-native-async-storage/async-storage.
 * The host passes the module in, so the dependency stays theirs: their import
 * is static and Metro resolves it normally, which is exactly the problem Loupe
 * cannot solve by probing for the package itself.
 */
export function createAsyncStorageAdapter(asyncStorageModule: unknown): StorageAdapter {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./impl').createAsyncStorageAdapter(asyncStorageModule);
  }
  throw new Error('Loupe: createAsyncStorageAdapter is dev-only. Use react-native-loupe/release.');
}

/** Build a storage adapter over react-native-mmkv (v2, v3 or v4). */
export function createMmkvAdapter(mmkvModule: unknown): StorageAdapter {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./impl').createMmkvAdapter(mmkvModule);
  }
  throw new Error('Loupe: createMmkvAdapter is dev-only. Use react-native-loupe/release.');
}

/** Build a storage adapter over react-native-keychain. */
export function createKeychainAdapter(keychainModule: unknown): StorageAdapter {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./impl').createKeychainAdapter(keychainModule);
  }
  throw new Error('Loupe: createKeychainAdapter is dev-only. Use react-native-loupe/release.');
}

/** Build a shake source over react-native-shake, for startLoupe({ shake }). */
export function createShakeSource(shakeModule: unknown): ShakeSource | null {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./impl').createShakeSource(shakeModule);
  }
  throw new Error('Loupe: createShakeSource is dev-only. Use react-native-loupe/release.');
}

export { registerTool, getTools } from './registry';
export type * from './types-public';

// Inert until this runs, and everything it touches is required lazily from
// inside the same __DEV__ blocks above — so Metro strips this branch, ./impl,
// and everything ./impl imports.
if (__DEV__) {
  startLoupe();
}
