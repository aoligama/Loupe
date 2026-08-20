const mockShare = jest.fn();

jest.mock('react-native', () => ({
  Share: { share: (...args: unknown[]) => mockShare(...args) },
}));

import { copyValue } from '../src/panels/clipboard';

beforeEach(() => {
  mockShare.mockReset().mockResolvedValue({ action: 'sharedAction' });
});

// copyValue used to prefer @react-native-clipboard/clipboard when installed.
// That was wrong twice over: requiring an absent optional peer throws uncaught
// under Metro, and the NativeModules gate added to prevent it reports null for
// every module under the New Architecture — so the clipboard branch never ran
// even when the package was present. Share is the only path now, and it needs
// nothing installed.
describe('copyValue', () => {
  it('shares the value', async () => {
    await copyValue('hello');

    expect(mockShare).toHaveBeenCalledWith({ message: 'hello' });
  });

  it('passes the value verbatim, including newlines and quotes', async () => {
    // The user is usually about to paste this into a bug report; altering a
    // byte of it would make the tool lie about what the app held.
    const value = '{\n  "a": "b\\"c"\n}';

    await copyValue(value);

    expect(mockShare).toHaveBeenCalledWith({ message: value });
  });

  it('resolves rather than throwing when the sheet is dismissed', async () => {
    // Dismissing rejects on some platforms. A failed copy must never surface as
    // a crash inside a debugging tool.
    mockShare.mockRejectedValue(new Error('User dismissed'));

    await expect(copyValue('hello')).resolves.toBeUndefined();
  });

  it('requires no optional peer, so it cannot crash an app that installed none', async () => {
    // The regression guard: any require() of a package the host may not have
    // reintroduces the uncaught "Requiring unknown module undefined" crash.
    // scripts/verify-absent-peers.sh enforces this across the whole library.
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../src/panels/clipboard.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/require\(['"]@react-native-clipboard/);
  });
});
