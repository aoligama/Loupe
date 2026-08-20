const mockAddEventListener = jest.fn();
const mockGetInitialURL = jest.fn();
const mockRemove = jest.fn();

jest.mock('react-native', () => ({
  Linking: {
    addEventListener: (...args: unknown[]) => mockAddEventListener(...args),
    getInitialURL: () => mockGetInitialURL(),
  },
}));

import { DebugEventBus } from '@loupe/core';
import type { DeepLinkPayload } from '@loupe/contract';
import { installDeepLinkCapture, emitOutgoing } from '../src/deeplink/capture';

const flush = () => new Promise((r) => setImmediate(r));

function payloads(bus: DebugEventBus): DeepLinkPayload[] {
  return bus.history('deeplink').map((e) => e.payload as DeepLinkPayload);
}

describe('installDeepLinkCapture', () => {
  let bus: DebugEventBus;

  beforeEach(() => {
    bus = new DebugEventBus();
    mockAddEventListener.mockReset().mockReturnValue({ remove: mockRemove });
    mockGetInitialURL.mockReset().mockResolvedValue(null);
    mockRemove.mockReset();
  });

  it('emits an incoming event when a link arrives while running', async () => {
    installDeepLinkCapture(bus);
    const handler = mockAddEventListener.mock.calls[0][1] as (e: { url: string }) => void;

    handler({ url: 'loupeexample://a' });

    expect(payloads(bus)).toEqual([
      { url: 'loupeexample://a', direction: 'incoming', arrival: 'running', opened: null, error: null },
    ]);
  });

  it('emits the cold-start URL exactly once', async () => {
    mockGetInitialURL.mockResolvedValue('loupeexample://launch');
    installDeepLinkCapture(bus);
    await flush();

    const cold = payloads(bus).filter((p) => p.arrival === 'cold-start');
    expect(cold).toHaveLength(1);
    expect(cold[0]!.url).toBe('loupeexample://launch');
  });

  it('emits nothing at cold start when the app was not launched from a link', async () => {
    installDeepLinkCapture(bus);
    await flush();
    expect(payloads(bus)).toEqual([]);
  });

  it('disposes the Linking subscription on teardown', () => {
    // A listener outliving its uninstaller is the failure mode this
    // architecture is most exposed to: startLoupe() can be called again to
    // reconfigure, and every previous subscription must go.
    const uninstall = installDeepLinkCapture(bus);
    uninstall();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('does not emit a cold-start event after teardown', async () => {
    // getInitialURL resolves on a later tick; if it lands after uninstall it
    // must not push an event into a bus the host has already torn down.
    let resolve!: (v: string | null) => void;
    mockGetInitialURL.mockReturnValue(new Promise((r) => { resolve = r; }));

    const uninstall = installDeepLinkCapture(bus);
    uninstall();
    resolve('loupeexample://late');
    await flush();

    expect(payloads(bus)).toEqual([]);
  });

  it('survives a getInitialURL that rejects', async () => {
    mockGetInitialURL.mockRejectedValue(new Error('no'));
    expect(() => installDeepLinkCapture(bus)).not.toThrow();
    await flush();
    expect(payloads(bus)).toEqual([]);
  });

  it('emitOutgoing records a successful open', () => {
    emitOutgoing(bus, 'loupeexample://a', true, null);
    expect(payloads(bus)).toEqual([
      { url: 'loupeexample://a', direction: 'outgoing', arrival: null, opened: true, error: null },
    ]);
  });

  it('emitOutgoing records a rejected open with its message', () => {
    emitOutgoing(bus, 'nope://a', false, 'No handler');
    expect(payloads(bus)).toEqual([
      { url: 'nope://a', direction: 'outgoing', arrival: null, opened: false, error: 'No handler' },
    ]);
  });
});
