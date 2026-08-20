import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { DebugEventBus } from '@loupe/core';
import type { StorageAdapter } from '../src/storage/types';
import { StoragePanel } from '../src/panels/StoragePanel';

function fakeAdapter(id: string, seed: Record<string, string>): StorageAdapter {
  const data = new Map(Object.entries(seed));
  return {
    id,
    label: id.toUpperCase(),
    list: async () => Array.from(data.keys()),
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => { data.set(k, v); },
    delete: async (k) => { data.delete(k); },
    clear: async () => { data.clear(); },
  };
}

const bus = new DebugEventBus();

describe('StoragePanel', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      // Auto-confirm: press the last (destructive) button.
      const confirm = buttons?.[buttons.length - 1];
      confirm?.onPress?.();
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('tells the developer when no backend is installed', async () => {
    render(<StoragePanel bus={bus} adapters={[]} />);
    expect(await screen.findByText(/no storage backend detected/i)).toBeTruthy();
  });

  it('lists keys from the detected adapter', async () => {
    render(<StoragePanel bus={bus} adapters={[fakeAdapter('mmkv', { token: 'abc' })]} />);
    expect(await screen.findByText('token')).toBeTruthy();
  });

  it('lets the developer switch between backends', async () => {
    render(
      <StoragePanel
        bus={bus}
        adapters={[fakeAdapter('mmkv', { token: 'abc' }), fakeAdapter('async', { theme: 'dark' })]}
      />,
    );
    expect(await screen.findByText('token')).toBeTruthy();

    fireEvent.press(screen.getByTestId('loupe-adapter-async'));
    expect(await screen.findByText('theme')).toBeTruthy();
    expect(screen.queryByText('token')).toBeNull();
  });

  it('shows a value when a key is selected', async () => {
    render(<StoragePanel bus={bus} adapters={[fakeAdapter('mmkv', { token: 'abc' })]} />);
    fireEvent.press(await screen.findByText('token'));
    expect(await screen.findByDisplayValue('abc')).toBeTruthy();
  });

  it('saves an edited value', async () => {
    const adapter = fakeAdapter('mmkv', { token: 'abc' });
    render(<StoragePanel bus={bus} adapters={[adapter]} />);
    fireEvent.press(await screen.findByText('token'));

    fireEvent.changeText(await screen.findByDisplayValue('abc'), 'xyz');
    fireEvent.press(screen.getByTestId('loupe-save'));

    await waitFor(async () => expect(await adapter.get('token')).toBe('xyz'));
  });

  it('confirms before deleting a key', async () => {
    const adapter = fakeAdapter('mmkv', { token: 'abc' });
    render(<StoragePanel bus={bus} adapters={[adapter]} />);
    fireEvent.press(await screen.findByText('token'));
    fireEvent.press(screen.getByTestId('loupe-delete'));

    expect(Alert.alert).toHaveBeenCalled();
    await waitFor(async () => expect(await adapter.list()).toEqual([]));
  });

  it('confirms before clearing everything', async () => {
    const adapter = fakeAdapter('mmkv', { a: '1', b: '2' });
    render(<StoragePanel bus={bus} adapters={[adapter]} />);
    expect(await screen.findByText('a')).toBeTruthy();

    fireEvent.press(screen.getByTestId('loupe-clear-all'));
    expect(Alert.alert).toHaveBeenCalled();
    await waitFor(async () => expect(await adapter.list()).toEqual([]));
  });

  it('does not delete a key when the alert is cancelled', async () => {
    (Alert.alert as jest.Mock).mockImplementation((_t, _m, buttons) => {
      // Press Cancel instead of the destructive confirm.
      buttons?.[0]?.onPress?.();
    });
    const adapter = fakeAdapter('mmkv', { token: 'abc' });
    render(<StoragePanel bus={bus} adapters={[adapter]} />);
    fireEvent.press(await screen.findByText('token'));
    fireEvent.press(screen.getByTestId('loupe-delete'));

    expect(Alert.alert).toHaveBeenCalled();
    await waitFor(async () => expect(await adapter.list()).toEqual(['token']));
    expect(await adapter.get('token')).toBe('abc');
  });

  it('does not clear storage when the alert is cancelled', async () => {
    (Alert.alert as jest.Mock).mockImplementation((_t, _m, buttons) => {
      // Press Cancel instead of the destructive confirm.
      buttons?.[0]?.onPress?.();
    });
    const adapter = fakeAdapter('mmkv', { a: '1', b: '2' });
    render(<StoragePanel bus={bus} adapters={[adapter]} />);
    expect(await screen.findByText('a')).toBeTruthy();

    fireEvent.press(screen.getByTestId('loupe-clear-all'));
    expect(Alert.alert).toHaveBeenCalled();
    await waitFor(async () => expect(await adapter.list()).toEqual(['a', 'b']));
  });

  it('refreshes the key list on demand', async () => {
    const adapter = fakeAdapter('mmkv', { a: '1' });
    render(<StoragePanel bus={bus} adapters={[adapter]} />);
    expect(await screen.findByText('a')).toBeTruthy();

    await adapter.set('b', '2');
    fireEvent.press(screen.getByTestId('loupe-refresh'));
    expect(await screen.findByText('b')).toBeTruthy();
  });

  it('surfaces an adapter failure instead of rendering an empty list', async () => {
    const broken: StorageAdapter = {
      ...fakeAdapter('broken', {}),
      list: async () => { throw new Error('native module missing'); },
    };
    render(<StoragePanel bus={bus} adapters={[broken]} />);
    expect(await screen.findByText(/native module missing/)).toBeTruthy();
  });
});
