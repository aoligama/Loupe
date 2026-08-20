import React from 'react';
import { AppRegistry } from 'react-native';
import { DebugEventBus } from '@loupe/core';
import type { EventBus } from '@loupe/core';
import { installNetworkCapture } from './capture/network';
import { installLogCapture } from './capture/log';
import { installDeepLinkCapture } from './deeplink/capture';
import { installShakeTrigger, fromReactNativeShake } from './shake/detect';
import { OverlayRoot, openOverlay as openOverlayImpl, closeOverlay as closeOverlayImpl } from './overlay/OverlayRoot';
import { registerBuiltIns } from './tools';
import { registerStorageAdapters } from './storage/detect';
import { createAsyncStorageAdapter as createAsyncStorageAdapterImpl } from './storage/async-storage';
import { createMmkvAdapter as createMmkvAdapterImpl } from './storage/mmkv';
import { createKeychainAdapter as createKeychainAdapterImpl } from './storage/keychain';
import type { LoupeConfig } from './config';

/**
 * The whole overlay, with no build-mode gating anywhere in it.
 *
 * Two entry points sit on top of this module and decide whether it is reachable
 * at all:
 *
 *   - `index.tsx` requires it lazily from inside `if (__DEV__)`, so Metro folds
 *     that branch away in a release build and this file — and everything it
 *     imports — never enters the dependency graph.
 *   - `release.tsx` imports it directly, for a host that wants the overlay in a
 *     TestFlight or internal build.
 *
 * Nothing here may test `__DEV__`. If a gate creeps back in, the release entry
 * silently loses whatever it guards — and the failure shows up as a working
 * overlay with an invisible UI, not as an error.
 */

let current: { bus: EventBus; teardown: () => void } | null = null;

export function getBus(): EventBus | null {
  return current?.bus ?? null;
}

export function stopLoupe(): void {
  current?.teardown();
  current = null;
}

export function startLoupe(config: LoupeConfig = {}): void {
  stopLoupe();

  const bus: EventBus = new DebugEventBus(config.buffers);
  const uninstallers = [installNetworkCapture(bus, { bodyCapBytes: config.bodyCapBytes })];
  uninstallers.push(installDeepLinkCapture(bus));

  // Shake is installed before log capture: with no usable sensor it logs a
  // one-time dev-menu hint, and that hint must not be captured as the app's own
  // log output. Installing log capture last keeps startup free of Loupe's own
  // bookkeeping noise.
  if (config.shake !== false) {
    uninstallers.push(
      installShakeTrigger(
        openOverlayImpl,
        typeof config.shake === 'object' ? config.shake : {},
        typeof config.shake === 'object' ? config.shake.source : undefined,
      ),
    );
  }

  uninstallers.push(installLogCapture(bus));

  // Registered before the panel can mount, so the first open already sees them.
  registerStorageAdapters(config.storageAdapters ?? []);

  registerBuiltIns();

  const showBubble = config.bubble !== false;
  // This is what actually puts the overlay on screen. It has to live with the
  // implementation rather than in an entry point: an entry that installs
  // capture but skips this produces working panels behind an invisible UI —
  // no bubble, no way in, and nothing that looks like an error.
  //
  // The wrapper slot is single-occupancy. If the host already uses it, this
  // replaces theirs — hence the exported LoupeRoot fallback.
  AppRegistry.setWrapperComponentProvider(
    () => ({ children }: { children: React.ReactNode }) =>
      (
        <OverlayRoot bus={bus} showBubble={showBubble}>
          {children}
        </OverlayRoot>
      ),
  );

  // Teardown is best-effort and must never throw into the host: stopLoupe() and
  // a reconfiguring startLoupe() are public. A broken native peer's uninstaller
  // must not abort the remaining ones — otherwise console could stay patched.
  current = {
    bus,
    teardown: () =>
      uninstallers.forEach((u: () => void) => {
        try {
          u();
        } catch {
          // best-effort; keep tearing down the rest
        }
      }),
  };
}

interface LoupeRootProps {
  bus: EventBus;
  showBubble?: boolean;
  children?: React.ReactNode;
}

/** Fallback wrapper for hosts whose AppRegistry wrapper slot is already taken. */
export function LoupeRoot(props: LoupeRootProps): React.ReactElement {
  return <OverlayRoot {...props} />;
}

export function openOverlay(): void {
  openOverlayImpl();
}

export function closeOverlay(): void {
  closeOverlayImpl();
}

export const createAsyncStorageAdapter = createAsyncStorageAdapterImpl;
export const createMmkvAdapter = createMmkvAdapterImpl;
export const createKeychainAdapter = createKeychainAdapterImpl;
export const createShakeSource = fromReactNativeShake;
