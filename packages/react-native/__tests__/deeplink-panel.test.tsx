const mockOpenURL = jest.fn();

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: (...args: unknown[]) => mockOpenURL(...args),
  addEventListener: () => ({ remove: () => {} }),
  getInitialURL: async () => null,
}));

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { DebugEventBus } from '@loupe/core';
import type { DeepLinkPayload } from '@loupe/contract';
import { DeepLinkPanel } from '../src/panels/DeepLinkPanel';
import type { LinkStore } from '../src/deeplink/links';

function memoryStore(seed: string[] = []): LinkStore {
  let links = [...seed];
  return {
    list: async () => [...links],
    add: async (u) => { if (!links.includes(u)) links = [...links, u]; },
    remove: async (u) => { links = links.filter((l) => l !== u); },
  };
}

describe('DeepLinkPanel', () => {
  let bus: DebugEventBus;

  beforeEach(() => {
    bus = new DebugEventBus();
    mockOpenURL.mockReset().mockResolvedValue(true);
  });

  it('lists the configured links', async () => {
    render(<DeepLinkPanel bus={bus} store={memoryStore(['loupeexample://a'])} />);
    expect(await screen.findByText('loupeexample://a')).toBeTruthy();
  });

  it('fires a link and records a successful open', async () => {
    render(<DeepLinkPanel bus={bus} store={memoryStore(['loupeexample://a'])} />);
    fireEvent.press(await screen.findByTestId('loupe-fire-loupeexample://a'));

    await waitFor(() => expect(mockOpenURL).toHaveBeenCalledWith('loupeexample://a'));
    await waitFor(() => {
      const p = bus.history('deeplink').map((e) => e.payload as DeepLinkPayload);
      expect(p).toEqual([
        { url: 'loupeexample://a', direction: 'outgoing', arrival: null, opened: true, error: null },
      ]);
    });
  });

  it('records a rejected open as a result, not a crash', async () => {
    // The normal case for this tool: an unregistered scheme is frequently the
    // bug being chased, so it must read as a result and never look like a crash.
    mockOpenURL.mockRejectedValue(new Error('No handler for URL'));
    render(<DeepLinkPanel bus={bus} store={memoryStore(['nope://a'])} />);

    fireEvent.press(await screen.findByTestId('loupe-fire-nope://a'));

    await waitFor(() => {
      const p = bus.history('deeplink').map((e) => e.payload as DeepLinkPayload);
      expect(p).toEqual([
        { url: 'nope://a', direction: 'outgoing', arrival: null, opened: false, error: 'No handler for URL' },
      ]);
    });
    expect(await screen.findByText(/No handler for URL/)).toBeTruthy();
  });

  it('adds a link typed into the field', async () => {
    const store = memoryStore();
    render(<DeepLinkPanel bus={bus} store={store} />);

    fireEvent.changeText(screen.getByTestId('loupe-link-input'), 'loupeexample://new');
    fireEvent.press(screen.getByTestId('loupe-link-add'));

    expect(await screen.findByText('loupeexample://new')).toBeTruthy();
    expect(await store.list()).toEqual(['loupeexample://new']);
  });

  it('ignores an empty or whitespace-only add', async () => {
    const store = memoryStore();
    render(<DeepLinkPanel bus={bus} store={store} />);

    fireEvent.changeText(screen.getByTestId('loupe-link-input'), '   ');
    fireEvent.press(screen.getByTestId('loupe-link-add'));

    await waitFor(async () => expect(await store.list()).toEqual([]));
  });

  it('shows both directions on the history timeline', async () => {
    render(<DeepLinkPanel bus={bus} store={memoryStore()} />);
    act(() => {
      bus.emit({
        schemaVersion: 0, id: 'e1', type: 'deeplink', timestamp: 1750000000000,
        sourcePluginId: 'deeplink',
        payload: {
          url: 'loupeexample://in', direction: 'incoming',
          arrival: 'running', opened: null, error: null,
        },
      });
    });

    fireEvent.press(screen.getByTestId('loupe-chip-history'));

    expect(await screen.findByText('loupeexample://in')).toBeTruthy();
    expect(screen.getByText('IN')).toBeTruthy();
  });

  it('renders the outgoing branch with its own label and outcome', async () => {
    // The outgoing render branch is the one path with neither a test nor device
    // verification, so a swapped ternary (IN/OUT, or opened/failed) would ship
    // green. Assert the label and the failure wording explicitly.
    render(<DeepLinkPanel bus={bus} store={memoryStore()} />);
    act(() => {
      bus.emit({
        schemaVersion: 0, id: 'e2', type: 'deeplink', timestamp: 1750000001000,
        sourcePluginId: 'deeplink',
        payload: {
          url: 'nope://out', direction: 'outgoing',
          arrival: null, opened: false, error: 'No handler for URL',
        },
      });
    });

    fireEvent.press(screen.getByTestId('loupe-chip-history'));

    expect(await screen.findByText('nope://out')).toBeTruthy();
    expect(screen.getByText('OUT')).toBeTruthy();
    expect(screen.getByText('failed')).toBeTruthy();
    expect(screen.getByText('No handler for URL')).toBeTruthy();
  });

  it('shows a successful outgoing fire as opened', async () => {
    render(<DeepLinkPanel bus={bus} store={memoryStore()} />);
    act(() => {
      bus.emit({
        schemaVersion: 0, id: 'e3', type: 'deeplink', timestamp: 1750000002000,
        sourcePluginId: 'deeplink',
        payload: {
          url: 'loupeexample://ok', direction: 'outgoing',
          arrival: null, opened: true, error: null,
        },
      });
    });

    fireEvent.press(screen.getByTestId('loupe-chip-history'));

    expect(await screen.findByText('opened')).toBeTruthy();
  });

  it('does not carry a stale error onto a link removed and re-added', async () => {
    // Removal is confirm-gated through Alert.alert; drive the destructive
    // button explicitly rather than assuming the dialog auto-confirms.
    const confirmSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const confirm = buttons?.[buttons.length - 1];
      confirm?.onPress?.();
    });

    mockOpenURL.mockRejectedValue(new Error('No handler for URL'));
    const store = memoryStore(['loupeexample://a']);
    render(<DeepLinkPanel bus={bus} store={store} />);

    fireEvent.press(await screen.findByTestId('loupe-fire-loupeexample://a'));
    expect(await screen.findByText(/No handler for URL/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('loupe-remove-loupeexample://a'));
    await waitFor(async () => expect(await store.list()).toEqual([]));

    fireEvent.changeText(screen.getByTestId('loupe-link-input'), 'loupeexample://a');
    fireEvent.press(screen.getByTestId('loupe-link-add'));

    expect(await screen.findByText('loupeexample://a')).toBeTruthy();
    expect(screen.queryByText(/No handler for URL/)).toBeNull();

    confirmSpy.mockRestore();
  });
});
