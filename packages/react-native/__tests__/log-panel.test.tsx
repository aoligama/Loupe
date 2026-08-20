import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react-native';
import { DebugEventBus } from '@loupe/core';
import type { LogPayload } from '@loupe/contract';
import { LogPanel } from '../src/panels/LogPanel';

function emit(bus: DebugEventBus, id: string, over: Partial<LogPayload> = {}) {
  act(() => {
    bus.emit({
      schemaVersion: 1, id, type: 'log', timestamp: 1750000000000,
      sourcePluginId: 'log',
      payload: {
        level: 'info', message: 'hello', tag: null, source: 'js',
        stackTrace: null, metadata: null, ...over,
      },
    });
  });
}

describe('LogPanel', () => {
  let bus: DebugEventBus;
  beforeEach(() => { bus = new DebugEventBus(); });

  it('replays history and appends live entries', () => {
    emit(bus, 'e1', { message: 'before mount' });
    render(<LogPanel bus={bus} />);
    expect(screen.getByText('before mount')).toBeTruthy();

    emit(bus, 'e2', { message: 'after mount' });
    expect(screen.getByText('after mount')).toBeTruthy();
  });

  it('shows the level for each entry', () => {
    render(<LogPanel bus={bus} />);
    emit(bus, 'e1', { level: 'warn', message: 'careful' });
    expect(screen.getByText('WARN')).toBeTruthy();
  });

  it('filters by message text', () => {
    render(<LogPanel bus={bus} />);
    emit(bus, 'e1', { message: 'alpha' });
    emit(bus, 'e2', { message: 'beta' });

    fireEvent.changeText(screen.getByTestId('loupe-filter'), 'bet');
    expect(screen.getByText('beta')).toBeTruthy();
    expect(screen.queryByText('alpha')).toBeNull();
  });

  it('filters by minimum level, hiding quieter entries', () => {
    render(<LogPanel bus={bus} />);
    emit(bus, 'e1', { level: 'debug', message: 'noisy' });
    emit(bus, 'e2', { level: 'error', message: 'important' });

    fireEvent.press(screen.getByTestId('loupe-level-warn'));
    expect(screen.getByText('important')).toBeTruthy();
    expect(screen.queryByText('noisy')).toBeNull();
  });

  it('shows all levels again when the filter is reset', () => {
    render(<LogPanel bus={bus} />);
    emit(bus, 'e1', { level: 'debug', message: 'noisy' });

    fireEvent.press(screen.getByTestId('loupe-level-warn'));
    expect(screen.queryByText('noisy')).toBeNull();

    fireEvent.press(screen.getByTestId('loupe-level-verbose'));
    expect(screen.getByText('noisy')).toBeTruthy();
  });

  it('reveals a stack trace on press and hides it again', () => {
    render(<LogPanel bus={bus} />);
    emit(bus, 'e1', { level: 'error', message: 'boom', stackTrace: 'at foo (bar.js:1)' });

    expect(screen.queryByText(/at foo/)).toBeNull();
    fireEvent.press(screen.getByText('boom'));
    expect(screen.getByText(/at foo/)).toBeTruthy();

    fireEvent.press(screen.getByText('boom'));
    expect(screen.queryByText(/at foo/)).toBeNull();
  });

  it('clears the buffer', () => {
    render(<LogPanel bus={bus} />);
    emit(bus, 'e1', { message: 'gone soon' });
    fireEvent.press(screen.getByTestId('loupe-clear'));
    expect(screen.queryByText('gone soon')).toBeNull();
    expect(bus.history('log')).toEqual([]);
  });

  it('reports dropped entries', () => {
    const capped = new DebugEventBus({ log: { countCap: 1 } });
    render(<LogPanel bus={capped} />);
    emit(capped, 'e1');
    emit(capped, 'e2');
    expect(screen.getByText(/1 older entr/i)).toBeTruthy();
  });
});
