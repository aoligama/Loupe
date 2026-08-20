import { DevSettings } from 'react-native';
import type { ShakeSource, ShakeOptions } from './types';
import { ShakeDetector } from './detector';

/** react-native-shake emits a cooked event; pass it straight through. */
export function fromReactNativeShake(module: unknown): ShakeSource | null {
  const m = module as { default?: { addListener?: (cb: () => void) => { remove(): void } } };
  const api = m.default ?? (m as { addListener?: (cb: () => void) => { remove(): void } });
  if (typeof api?.addListener !== 'function') return null;

  return {
    id: 'react-native-shake',
    onShake: (cb) => {
      const sub = api.addListener!(cb);
      return { dispose: () => sub.remove() };
    },
  };
}

/** expo-sensors supplies raw samples; ShakeDetector decides what a shake is. */
function fromExpoSensors(module: unknown, options: ShakeOptions): ShakeSource | null {
  const m = module as {
    Accelerometer?: {
      setUpdateInterval(ms: number): void;
      addListener(cb: (s: { x: number; y: number; z: number }) => void): { remove(): void };
    };
  };
  const accelerometer = m.Accelerometer;
  if (!accelerometer) return null;

  return {
    id: 'expo-sensors',
    onShake: (cb) => {
      const detector = new ShakeDetector(options);
      accelerometer.setUpdateInterval(100);
      const sub = accelerometer.addListener((sample) => {
        if (detector.push(sample, Date.now())) cb();
      });
      return { dispose: () => sub.remove() };
    },
  };
}

/**
 * Loupe requires no sensor package of its own — see the comment on
 * detectStorageAdapters in ../storage/detect.ts. Requiring an absent optional
 * peer throws uncaught under Metro, and this runs inside startLoupe, so the
 * old code would have crashed a host app on import rather than merely breaking
 * a panel.
 *
 * A host that wants a real shake gesture builds the source itself:
 *
 *   import Shake from 'react-native-shake';
 *   startLoupe({ shake: { source: fromReactNativeShake(Shake) } });
 */
export function detectShakeSource(options: ShakeOptions = {}): ShakeSource | null {
  void options;
  return null;
}

/**
 * Wire up a shake trigger, falling back to the dev menu when neither optional
 * sensor package is installed (or when the one that is installed turns out to
 * be broken). Shake already opens the dev menu, so the fallback costs the
 * developer one extra tap and costs the app zero bytes.
 */
export function installShakeTrigger(
  onShake: () => void,
  options: ShakeOptions = {},
  hostSource?: ShakeSource | null,
): () => void {
  const source = hostSource ?? detectShakeSource(options);

  if (source) {
    try {
      const sub = source.onShake(onShake);
      return () => sub.dispose();
    } catch {
      // Subscribing is where a present-but-broken native module actually
      // throws (detection above only inspects shape). Never let that crash
      // the overlay — fall through to the dev-menu fallback below.
    }
  }

  // Developer guidance, so only useful where a developer can act on it. In a
  // release build there is no dev menu to fall back to and no way to install a
  // package, and this would otherwise print on every single launch — permanent
  // noise in a TestFlight session, captured by Loupe's own log panel.
  if (__DEV__) {
    console.info(
      'Loupe: shake-to-open is unavailable. Install react-native-shake or expo-sensors ' +
        'for a real shake gesture. Falling back to the dev menu entry "Open Loupe".',
    );
  }

  try {
    if (typeof DevSettings?.addMenuItem === 'function') {
      DevSettings.addMenuItem('Open Loupe', onShake);
    }
  } catch {
    // Best-effort: DevSettings is dev-only scaffolding, not worth crashing over.
  }
  // The dev menu has no removal API; the no-op uninstall is honest about that.
  return () => {};
}
