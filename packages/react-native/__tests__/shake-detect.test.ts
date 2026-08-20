// installShakeTrigger owns the shake never-crash path. Loupe no longer probes
// for a sensor package: requiring an absent optional peer throws uncaught under
// Metro, and this code runs inside startLoupe, so the old version would have
// crashed a host app on import rather than merely breaking a panel.
//
// A host that wants a real gesture builds the source and passes it in. Without
// one, Loupe installs the dev-menu fallback, which needs nothing installed.

const mockAddMenuItem = jest.fn();
// The reference is deferred into the arrow: jest hoists this factory above the
// const above, so naming mockAddMenuItem directly captures it while still in
// its temporal dead zone and the mock ends up holding undefined.
jest.mock('react-native', () => ({
  DevSettings: { addMenuItem: (...args: unknown[]) => mockAddMenuItem(...args) },
}));

import {
  detectShakeSource,
  fromReactNativeShake,
  installShakeTrigger,
} from '../src/shake/detect';
import type { ShakeSource } from '../src/shake/types';

describe('shake without a host-supplied source', () => {
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    mockAddMenuItem.mockClear();
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => infoSpy.mockRestore());

  it('detects nothing on its own, and does not throw doing so', () => {
    // This is the path in every app that wires no sensor. It must be inert —
    // the previous version reached a require() here.
    expect(() => detectShakeSource()).not.toThrow();
    expect(detectShakeSource()).toBeNull();
  });

  it('installs the dev-menu fallback and says why', () => {
    installShakeTrigger(() => {});

    expect(mockAddMenuItem).toHaveBeenCalledWith('Open Loupe', expect.any(Function));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('shake-to-open is unavailable'));
  });

  it('opens the overlay from the dev-menu entry', () => {
    const onShake = jest.fn();
    installShakeTrigger(onShake);

    mockAddMenuItem.mock.calls[0]![1]();

    expect(onShake).toHaveBeenCalled();
  });
});

describe('shake with a host-supplied source', () => {
  beforeEach(() => mockAddMenuItem.mockClear());

  it('subscribes to it instead of falling back', () => {
    const dispose = jest.fn();
    const onShake = jest.fn();
    let captured: (() => void) | null = null;
    const source: ShakeSource = {
      id: 'host',
      onShake: (cb) => {
        captured = cb;
        return { dispose };
      },
    };

    const uninstall = installShakeTrigger(onShake, {}, source);

    expect(mockAddMenuItem).not.toHaveBeenCalled();
    captured!();
    expect(onShake).toHaveBeenCalled();

    uninstall();
    expect(dispose).toHaveBeenCalled();
  });

  it('falls back to the dev menu when the host source throws on subscribe', () => {
    // Subscribing is where a broken native module actually throws — detection
    // only inspects shape. That must never take the overlay down.
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const source: ShakeSource = {
      id: 'broken',
      onShake: () => {
        throw new Error('native listener blew up');
      },
    };

    expect(() => installShakeTrigger(() => {}, {}, source)).not.toThrow();
    expect(mockAddMenuItem).toHaveBeenCalledWith('Open Loupe', expect.any(Function));

    infoSpy.mockRestore();
  });
});

describe('fromReactNativeShake', () => {
  it('adapts a module the host passes in', () => {
    const remove = jest.fn();
    const addListener = jest.fn().mockReturnValue({ remove });

    const source = fromReactNativeShake({ default: { addListener } });

    expect(source).not.toBeNull();
    const sub = source!.onShake(() => {});
    expect(addListener).toHaveBeenCalled();
    sub.dispose();
    expect(remove).toHaveBeenCalled();
  });

  it('returns null for a module that is not shaped like react-native-shake', () => {
    expect(fromReactNativeShake({ nope: true })).toBeNull();
  });
});
