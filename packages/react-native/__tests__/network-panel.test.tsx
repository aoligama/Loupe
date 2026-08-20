const mockCopyValue = jest.fn();
jest.mock('../src/panels/clipboard', () => ({
  copyValue: (...args: unknown[]) => mockCopyValue(...args),
}));

import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react-native';
import { DebugEventBus } from '@loupe/core';
import type { NetworkPayload } from '@loupe/contract';
import { NetworkPanel } from '../src/panels/NetworkPanel';

function payload(over: Partial<NetworkPayload> = {}): NetworkPayload {
  return {
    requestId: 'r1', status: 'pending',
    url: 'https://api.example.com/v1/items', method: 'GET',
    requestHeaders: { accept: 'application/json' },
    requestBody: { content: null, encoding: 'none', size: 0, truncated: false, mimeType: null },
    startTime: 1750000000000,
    statusCode: null, responseHeaders: null, responseBody: null,
    endTime: null, durationMs: null, error: null, stack: 'js', protocol: null,
    ...over,
  };
}

function emit(bus: DebugEventBus, id: string, over: Partial<NetworkPayload> = {}) {
  act(() => {
    bus.emit({
      schemaVersion: 1, id, type: 'network', timestamp: 0,
      sourcePluginId: 'network', payload: payload(over),
    });
  });
}

describe('NetworkPanel', () => {
  let bus: DebugEventBus;
  beforeEach(() => { bus = new DebugEventBus(); });

  it('replays history captured before the panel mounted', () => {
    emit(bus, 'e1');
    render(<NetworkPanel bus={bus} />);
    expect(screen.getByText('/v1/items')).toBeTruthy();
  });

  it('shows requests that arrive after mount', () => {
    render(<NetworkPanel bus={bus} />);
    expect(screen.queryByText('/v1/items')).toBeNull();
    emit(bus, 'e1');
    expect(screen.getByText('/v1/items')).toBeTruthy();
  });

  it('shows an in-flight request as pending, then updates it in place', () => {
    render(<NetworkPanel bus={bus} />);
    emit(bus, 'e1');
    expect(screen.getByText('pending')).toBeTruthy();

    emit(bus, 'e2', { status: 'success', statusCode: 200, durationMs: 120, endTime: 1 });
    expect(screen.queryByText('pending')).toBeNull();
    expect(screen.getByText('200')).toBeTruthy();
    expect(screen.getByText('120 ms')).toBeTruthy();
    expect(screen.getAllByText('/v1/items')).toHaveLength(1);
  });

  it('shows the method', () => {
    render(<NetworkPanel bus={bus} />);
    emit(bus, 'e1', { method: 'POST' });
    expect(screen.getByText('POST')).toBeTruthy();
  });

  it('filters by url substring', () => {
    render(<NetworkPanel bus={bus} />);
    emit(bus, 'e1', { requestId: 'r1', url: 'https://api.example.com/v1/items' });
    emit(bus, 'e2', { requestId: 'r2', url: 'https://api.example.com/v1/users' });

    fireEvent.changeText(screen.getByTestId('loupe-filter'), 'users');
    expect(screen.getByText('/v1/users')).toBeTruthy();
    expect(screen.queryByText('/v1/items')).toBeNull();
  });

  it('opens a detail view with headers and body', () => {
    render(<NetworkPanel bus={bus} />);
    emit(bus, 'e1', {
      status: 'success', statusCode: 200, durationMs: 5, endTime: 1,
      responseHeaders: { 'content-type': 'application/json' },
      responseBody: {
        content: '{"ok":true}', encoding: 'utf8', size: 11,
        truncated: false, mimeType: 'application/json',
      },
    });

    fireEvent.press(screen.getByText('/v1/items'));
    expect(screen.getByText('https://api.example.com/v1/items')).toBeTruthy();
    expect(screen.getByText(/content-type/)).toBeTruthy();
    // A JSON body renders as a structured tree. The raw bytes stay reachable
    // through the raw toggle, and copy still hands over the original string.
    expect(screen.getByText('ok: ')).toBeTruthy();
    expect(screen.getByText('true')).toBeTruthy();
  });

  it('flags a truncated body in the detail view', () => {
    render(<NetworkPanel bus={bus} />);
    emit(bus, 'e1', {
      status: 'success', statusCode: 200, endTime: 1, durationMs: 5,
      responseHeaders: {},
      responseBody: {
        content: 'xxx', encoding: 'utf8', size: 999999,
        truncated: true, mimeType: 'text/plain',
      },
    });

    fireEvent.press(screen.getByText('/v1/items'));
    expect(screen.getByText(/truncated/i)).toBeTruthy();
  });

  it('shows the error message for a failed request', () => {
    render(<NetworkPanel bus={bus} />);
    emit(bus, 'e1', { status: 'error', error: 'Network request failed', endTime: 1, durationMs: 30 });
    expect(screen.getByText('ERR')).toBeTruthy();

    fireEvent.press(screen.getByText('/v1/items'));
    expect(screen.getByText('Network request failed')).toBeTruthy();
  });

  it('clears the buffer', () => {
    render(<NetworkPanel bus={bus} />);
    emit(bus, 'e1');
    fireEvent.press(screen.getByTestId('loupe-clear'));
    expect(screen.queryByText('/v1/items')).toBeNull();
    expect(bus.history('network')).toEqual([]);
  });

  it('reports dropped entries', () => {
    const capped = new DebugEventBus({ network: { countCap: 1 } });
    render(<NetworkPanel bus={capped} />);
    emit(capped, 'e1', { requestId: 'r1' });
    emit(capped, 'e2', { requestId: 'r2' });
    expect(screen.getByText(/1 older entr/i)).toBeTruthy();
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<NetworkPanel bus={bus} />);
    unmount();
    expect(() => emit(bus, 'e1')).not.toThrow();
  });

  it('actually disposes its bus subscription on unmount', () => {
    // The test above only proves emit does not throw — but React 18 no-ops
    // setState on an unmounted component regardless of whether the subscription
    // leaked, so it cannot distinguish disposed from leaked. This one spies on
    // the returned subscription and proves dispose() is called. useEvents is
    // shared by all three panels, so this guards every panel's cleanup.
    const dispose = jest.fn();
    const realSubscribe = bus.subscribe.bind(bus);
    jest.spyOn(bus, 'subscribe').mockImplementation((type, listener) => {
      const sub = realSubscribe(type, listener);
      return {
        dispose: () => {
          dispose();
          sub.dispose();
        },
      };
    });

    const { unmount } = render(<NetworkPanel bus={bus} />);
    expect(dispose).not.toHaveBeenCalled();
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe('NetworkPanel with GraphQL traffic', () => {
  let bus: DebugEventBus;
  beforeEach(() => { bus = new DebugEventBus(); });

  const gqlRequest = (query: string, variables?: unknown) => ({
    content: JSON.stringify({ query, variables }),
    encoding: 'utf8' as const,
    size: 100,
    truncated: false,
    mimeType: 'application/json',
  });

  const gqlResponse = (obj: unknown) => ({
    content: JSON.stringify(obj),
    encoding: 'utf8' as const,
    size: 100,
    truncated: false,
    mimeType: 'application/json',
  });

  it('titles the row with the operation name, not the shared path', () => {
    // Every GraphQL request POSTs to the same URL. Without this the whole list
    // reads "POST /graphql" and nothing can be found in it.
    render(<NetworkPanel bus={bus} />);
    emit(bus, 'e1', {
      method: 'POST',
      url: 'https://api.example.com/graphql',
      requestBody: gqlRequest('query GetAppointments { me { id } }'),
    });

    expect(screen.getByText('GetAppointments')).toBeTruthy();
    expect(screen.getByText('QRY')).toBeTruthy();
  });

  it('marks a mutation distinctly from a query', () => {
    render(<NetworkPanel bus={bus} />);
    emit(bus, 'e1', {
      method: 'POST',
      url: 'https://api.example.com/graphql',
      requestBody: gqlRequest('mutation SaveNote { save }'),
    });

    expect(screen.getByText('MUT')).toBeTruthy();
  });

  it('does not report a GraphQL failure as a plain 200', () => {
    // The most valuable thing in this panel for a GraphQL app: the transport
    // succeeded, the operation did not, and a bare green 200 hides that.
    render(<NetworkPanel bus={bus} />);
    emit(bus, 'e1', {
      method: 'POST',
      url: 'https://api.example.com/graphql',
      status: 'success', statusCode: 200, endTime: 1, durationMs: 12,
      requestBody: gqlRequest('query GetMe { me { id } }'),
      responseBody: gqlResponse({ data: null, errors: [{ message: 'Unauthorized' }] }),
    });

    expect(screen.getByText('200 · 1 err')).toBeTruthy();
    expect(screen.queryByText('200')).toBeNull();
  });

  it('leads with the errors in the detail view', () => {
    render(<NetworkPanel bus={bus} />);
    emit(bus, 'e1', {
      method: 'POST',
      url: 'https://api.example.com/graphql',
      status: 'success', statusCode: 200, endTime: 1, durationMs: 12,
      requestBody: gqlRequest('query GetMe { me { id } }'),
      responseBody: gqlResponse({ data: null, errors: [{ message: 'Unauthorized' }] }),
    });

    fireEvent.press(screen.getByText('GetMe'));

    expect(screen.getByTestId('loupe-gql-errors')).toBeTruthy();
    expect(screen.getByText('GraphQL error')).toBeTruthy();
  });

  it('filters by operation name', () => {
    render(<NetworkPanel bus={bus} />);
    emit(bus, 'e1', {
      requestId: 'r1', method: 'POST', url: 'https://api.example.com/graphql',
      requestBody: gqlRequest('query GetAppointments { a }'),
    });
    emit(bus, 'e2', {
      requestId: 'r2', method: 'POST', url: 'https://api.example.com/graphql',
      requestBody: gqlRequest('query GetPatients { p }'),
    });

    fireEvent.changeText(screen.getByTestId('loupe-filter'), 'patients');

    expect(screen.getByText('GetPatients')).toBeTruthy();
    expect(screen.queryByText('GetAppointments')).toBeNull();
  });

  it('leaves non-GraphQL requests showing their path and verb', () => {
    render(<NetworkPanel bus={bus} />);
    emit(bus, 'e1', { method: 'GET', url: 'https://api.example.com/v1/items' });

    expect(screen.getByText('/v1/items')).toBeTruthy();
    expect(screen.getByText('GET')).toBeTruthy();
  });
});

describe('copy as curl', () => {
  let bus: DebugEventBus;
  beforeEach(() => {
    bus = new DebugEventBus();
    mockCopyValue.mockReset();
  });

  it('copies a runnable command for the selected request', () => {
    render(<NetworkPanel bus={bus} />);
    emit(bus, 'e1', {
      method: 'POST',
      url: 'https://api.example.com/graphql',
      requestHeaders: { 'content-type': 'application/json' },
      requestBody: {
        content: '{"query":"query Q { a }"}', encoding: 'utf8', size: 25,
        truncated: false, mimeType: 'application/json',
      },
    });

    fireEvent.press(screen.getByText('/graphql'));
    fireEvent.press(screen.getByTestId('loupe-copy-curl'));

    const cmd = mockCopyValue.mock.calls[0]![0] as string;
    expect(cmd).toContain('curl');
    expect(cmd).toContain('-X POST');
    expect(cmd).toContain("'https://api.example.com/graphql'");
    expect(cmd).toContain('--data-raw');
  });

  it('does not put a live credential on the clipboard', () => {
    render(<NetworkPanel bus={bus} />);
    emit(bus, 'e1', {
      url: 'https://api.example.com/v1/me',
      requestHeaders: { authorization: 'Bearer live-session-token' },
    });

    fireEvent.press(screen.getByText('/v1/me'));
    fireEvent.press(screen.getByTestId('loupe-copy-curl'));

    const cmd = mockCopyValue.mock.calls[0]![0] as string;
    expect(cmd).not.toContain('live-session-token');
    expect(cmd).toContain('<redacted>');
  });
});
