/**
 * The release entry point: the same overlay, with no `__DEV__` gating.
 *
 *   import { startLoupe, createKeychainAdapter } from 'react-native-loupe/release'
 *
 * The default entry ships nothing into a release build. This one deliberately
 * does, for putting the overlay in front of testers on TestFlight or an
 * internal track. Import it only from a build you intend to hand to people who
 * should see it — the panels display network bodies, stored values and logs.
 *
 * Unlike the default entry, this one does NOT start on import. A production
 * build that activates a debug overlay merely because a module was imported is
 * a footgun, and a host reaching for this entry has to call startLoupe anyway
 * to pass its storage adapters. One explicit call, so the decision is visible
 * at the call site.
 *
 * Two behaviours differ in a release build, neither of them a defect:
 *
 *   - Shake falls back to the dev menu, which does not exist in a release
 *     build, so shake does nothing. Pass `shake: false` unless you supply a
 *     source. Loupe no longer logs the dev-menu hint outside __DEV__, so this
 *     costs nothing but the missing gesture.
 *   - Error-level log entries carry a minified Hermes stack unless the build
 *     is symbolicated, so the log panel is weaker than it is in development.
 */
export {
  startLoupe,
  stopLoupe,
  getBus,
  LoupeRoot,
  openOverlay,
  closeOverlay,
  createAsyncStorageAdapter,
  createMmkvAdapter,
  createKeychainAdapter,
  createShakeSource,
} from './impl';

export { registerTool, getTools } from './registry';

export type { LoupeConfig } from './config';
export type * from './types-public';
