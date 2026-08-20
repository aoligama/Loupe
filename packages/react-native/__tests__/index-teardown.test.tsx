// Whole-branch review finding: startLoupe's teardown runs the uninstallers in
// a forEach. A broken native peer (e.g. react-native-shake's remove() throwing)
// must not abort the remaining uninstallers — otherwise console stays patched —
// nor propagate out of stopLoupe()/startLoupe(), which are public and NOT
// __DEV__-gated. This file forces the shake uninstaller to throw and proves the
// teardown is best-effort. Isolated in its own file because it mocks the whole
// shake/detect module.

jest.mock('react-native/Libraries/Utilities/DevSettings', () => ({
  addMenuItem: jest.fn(),
}));

// installShakeTrigger returns an uninstaller that throws, mimicking a native
// remove() that blows up. Its position in the uninstaller array is BEFORE the
// log uninstaller, so an unguarded teardown would skip restoring console.
jest.mock('../src/shake/detect', () => ({
  installShakeTrigger: () => () => {
    throw new Error('native remove() blew up');
  },
}));

import { startLoupe, stopLoupe, getBus } from '../src';
import { resetRegistry } from '../src/registry';

describe('startLoupe teardown resilience', () => {
  beforeEach(() => {
    // Clear any state from the import-time auto-init (and restore console),
    // so the baseline captured below is the real console.
    stopLoupe();
    resetRegistry();
  });

  afterEach(() => {
    stopLoupe();
    resetRegistry();
  });

  it('does not throw out of stopLoupe when an uninstaller throws, and still restores console', () => {
    const originalLog = console.log;

    startLoupe();
    // Log capture is active — console.log has been patched.
    expect(console.log).not.toBe(originalLog);

    // The shake uninstaller throws during teardown; stopLoupe must swallow it.
    expect(() => stopLoupe()).not.toThrow();

    // The log uninstaller (after the throwing shake one) still ran: console is
    // restored. Without the per-uninstaller guard, the throw aborts the forEach
    // and console stays patched.
    expect(console.log).toBe(originalLog);
    expect(getBus()).toBeNull();
  });

  it('does not throw when a reconfiguring startLoupe() tears the previous run down', () => {
    startLoupe();
    // A second startLoupe() calls stopLoupe() first — the throwing uninstaller
    // must not propagate out of this public call either.
    expect(() => startLoupe({ bubble: false })).not.toThrow();
  });
});
