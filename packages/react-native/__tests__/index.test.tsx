// The shake trigger's dev-menu fallback reads react-native's real DevSettings
// module, whose first access in a Jest environment (no native module linked)
// logs its own NativeEventEmitter warnings — noise unrelated to anything this
// suite tests. Mocking only this submodule (not all of 'react-native', which
// the UI assertions below need for real) keeps the run pristine.
jest.mock('react-native/Libraries/Utilities/DevSettings', () => ({
  addMenuItem: jest.fn(),
}));

import { render, screen, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { startLoupe, stopLoupe, getBus, LoupeRoot } from '../src';
import { getTools, resetRegistry } from '../src/registry';

const CONSOLE_METHODS = ['log', 'debug', 'info', 'warn', 'error', 'trace'] as const;

describe('startLoupe', () => {
  let spies: jest.SpyInstance[];

  beforeEach(() => {
    // Silence real console output so the suite stays readable — same
    // convention as log.test.ts. installLogCapture wraps whichever function
    // is installed at call time, so muting here (before startLoupe() patches
    // it) keeps capture semantics intact while suppressing the print. This
    // also covers the console.info hint that every startLoupe() call
    // triggers via the shake trigger: react-native-shake/expo-sensors are
    // present as peers in this workspace but non-functional under Jest (no
    // native module linked), so detection always falls back to that hint —
    // see shake-detect.test.ts for the same behavior in isolation.
    spies = CONSOLE_METHODS.map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  });

  afterEach(() => {
    stopLoupe();
    resetRegistry();
    spies.forEach((s) => s.mockRestore());
  });

  it('registers the four built-ins', () => {
    startLoupe();
    expect(getTools().map((t) => t.id)).toEqual(['network', 'log', 'storage', 'deeplink']);
  });

  it('is idempotent — a second call does not duplicate tools or throw', () => {
    startLoupe();
    expect(() => startLoupe()).not.toThrow();
    expect(getTools().map((t) => t.id)).toEqual(['network', 'log', 'storage', 'deeplink']);
  });

  it('exposes a bus that captures console output', () => {
    startLoupe();
    console.log('captured');
    expect(getBus()!.history('log')).toHaveLength(1);
  });

  it('applies buffer overrides', () => {
    startLoupe({ buffers: { log: { countCap: 1 } } });
    console.log('a');
    console.log('b');
    expect(getBus()!.history('log')).toHaveLength(1);
    expect(getBus()!.droppedCount('log')).toBe(1);
  });

  it('stops capturing after stopLoupe', () => {
    startLoupe();
    const bus = getBus()!;
    stopLoupe();
    console.log('after stop');
    expect(bus.history('log')).toHaveLength(0);
    expect(getBus()).toBeNull();
  });

  it('exports LoupeRoot for hosts whose wrapper slot is taken', () => {
    startLoupe();
    render(
      <LoupeRoot bus={getBus()!}>
        <Text>host</Text>
      </LoupeRoot>,
    );
    expect(screen.getByText('host')).toBeTruthy();
    expect(screen.getByTestId('loupe-bubble')).toBeTruthy();
  });

  it('hides the bubble when configured off', () => {
    startLoupe({ bubble: false });
    render(<LoupeRoot bus={getBus()!} showBubble={false} />);
    expect(screen.queryByTestId('loupe-bubble')).toBeNull();
  });

  it('renders built-in glyph icons in the launcher', () => {
    startLoupe();
    render(<LoupeRoot bus={getBus()!} />);
    fireEvent.press(screen.getByTestId('loupe-bubble'));
    // The tool titles ('network'/'storage') render regardless of icon form, so
    // asserting them alone does not prove the glyph branch fired. Assert the
    // actual glyph characters — that is what proves the `{glyph}` icon rendered
    // as <Text> rather than falling into the <Image> branch (or crashing the
    // `'glyph' in icon` guard on a numeric icon).
    expect(screen.getByText('network')).toBeTruthy();
    expect(screen.getByText('storage')).toBeTruthy();
    expect(screen.getByText('⇅')).toBeTruthy(); // network glyph
    expect(screen.getByText('≡')).toBeTruthy(); // log glyph
    expect(screen.getByText('▤')).toBeTruthy(); // storage glyph
    expect(screen.getByText('\u2197\uFE0E')).toBeTruthy(); // deeplink glyph
  });

  it('registers deeplink as a fourth built-in tool', () => {
    startLoupe();
    expect(getTools().map((t) => t.id)).toEqual(['network', 'log', 'storage', 'deeplink']);
  });
});
