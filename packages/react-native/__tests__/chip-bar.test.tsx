import React from 'react';
import { render, screen, act } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { DebugEventBus } from '@loupe/core';
import type { StorageAdapter } from '../src/storage/types';
import { LogPanel } from '../src/panels/LogPanel';
import { StoragePanel } from '../src/panels/StoragePanel';
import { DeepLinkPanel } from '../src/panels/DeepLinkPanel';
import type { LinkStore } from '../src/deeplink/links';

const emptyStore: LinkStore = {
  list: async () => [],
  add: async () => {},
  remove: async () => {},
};

// A horizontal ScrollView is a flex child like any other, and React Native
// gives it `flexGrow: 1` by default. Dropped into a panel's flex column with
// nothing to constrain its height, it therefore expands to swallow whatever
// vertical space the list below it is not using — and because a content
// container defaults to `alignItems: 'stretch'`, every chip inside stretches
// to that full height. The result on device is a row of pills hundreds of
// points tall with clipped labels.
//
// The chips render, respond to presses, and read correctly in every
// behavioural test, so nothing else in this suite can see the problem. These
// assertions pin the two style properties that keep the row the height of its
// own content.
function chipBarStyle(testID: string): Record<string, unknown> {
  const bar = screen.getByTestId(testID);
  return StyleSheet.flatten(bar.props.style) ?? {};
}

function chipBarContentStyle(testID: string): Record<string, unknown> {
  const bar = screen.getByTestId(testID);
  return StyleSheet.flatten(bar.props.contentContainerStyle) ?? {};
}

const adapter: StorageAdapter = {
  id: 'fake',
  label: 'Fake',
  list: async () => ['k'],
  get: async () => 'v',
  set: async () => {},
  delete: async () => {},
  clear: async () => {},
};

describe('panel chip bars stay the height of their content', () => {
  it('the deeplink view switcher does not grow to fill the panel', async () => {
    render(<DeepLinkPanel bus={new DebugEventBus()} store={emptyStore} />);
    // render() already wraps in act(); this flushes the async mount effect that
    // would otherwise settle after the test returns and warn.
    await act(async () => {});

    expect(chipBarStyle('loupe-chip-bar').flexGrow).toBe(0);
    expect(chipBarContentStyle('loupe-chip-bar').alignItems).toBe('center');
  });

  it('the log level bar does not grow to fill the panel', () => {
    render(<LogPanel bus={new DebugEventBus()} />);

    expect(chipBarStyle('loupe-chip-bar').flexGrow).toBe(0);
    expect(chipBarContentStyle('loupe-chip-bar').alignItems).toBe('center');
  });

  it('the storage adapter bar does not grow to fill the panel', async () => {
    // StoragePanel refreshes its key list on mount, so the render must be
    // awaited inside act(). Without it the async state update lands after the
    // test returns and warns — and this repo keeps test output pristine on
    // purpose (see the act() wrap in overlay.test.tsx).
    render(<StoragePanel bus={new DebugEventBus()} adapters={[adapter]} />);
    await act(async () => {});

    expect(chipBarStyle('loupe-chip-bar').flexGrow).toBe(0);
    expect(chipBarContentStyle('loupe-chip-bar').alignItems).toBe('center');
  });
});
