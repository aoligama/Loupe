import { DebugEventBus } from '@loupe/core';
import type { DebugEvent, LogPayload } from '@loupe/contract';
import { installLogCapture } from '../src/capture/log';

describe('installLogCapture', () => {
  let bus: DebugEventBus;
  let seen: DebugEvent[];
  let uninstall: () => void;
  let originals: Record<string, unknown>;

  beforeEach(() => {
    originals = {
      log: console.log, debug: console.debug, info: console.info,
      warn: console.warn, error: console.error, trace: console.trace,
    };
    // Silence real output so the suite stays readable.
    (['log', 'debug', 'info', 'warn', 'error', 'trace'] as const).forEach((m) => {
      console[m] = () => {};
    });

    bus = new DebugEventBus();
    seen = [];
    bus.subscribe('log', (e) => seen.push(e));
    uninstall = installLogCapture(bus);
  });

  afterEach(() => {
    uninstall();
    Object.assign(console, originals);
  });

  const payload = (i = 0): LogPayload => seen[i]!.payload as LogPayload;

  it('maps console methods to contract levels', () => {
    console.log('a');
    console.debug('b');
    console.info('c');
    console.warn('d');
    console.error('e');
    console.trace('f');

    expect(seen.map((e) => (e.payload as LogPayload).level)).toEqual([
      'info', 'debug', 'info', 'warn', 'error', 'verbose',
    ]);
  });

  it('marks every entry as a JS-sourced log with a null tag', () => {
    console.log('a');
    expect(payload().source).toBe('js');
    expect(payload().tag).toBeNull();
    expect(seen[0]!.type).toBe('log');
    expect(seen[0]!.sourcePluginId).toBe('log');
  });

  it('joins multiple arguments into one message', () => {
    console.log('user', 42);
    expect(payload().message).toBe('user 42');
  });

  it('serializes object arguments rather than printing [object Object]', () => {
    console.log({ a: 1 });
    expect(payload().message).toBe('{"a":1}');
  });

  it('survives an unserializable argument', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => console.log(cyclic)).not.toThrow();
    expect(payload().message).toContain('[unserializable]');
  });

  it('renders an Error argument with its message', () => {
    console.error(new Error('kaboom'));
    expect(payload().message).toContain('kaboom');
  });

  it('attaches a stack trace to errors only', () => {
    console.error('bad');
    expect(payload().stackTrace).toEqual(expect.any(String));

    seen = [];
    console.log('fine');
    expect(payload().stackTrace).toBeNull();
  });

  it('still calls through to the original console method', () => {
    const calls: unknown[][] = [];
    console.log = (...args: unknown[]) => { calls.push(args); };
    uninstall();
    uninstall = installLogCapture(bus);

    console.log('passed through', 1);
    expect(calls).toEqual([['passed through', 1]]);
  });

  it('does not recurse when a bus subscriber logs', () => {
    bus.subscribe('log', () => { console.log('from a subscriber'); });
    console.log('original');
    expect(seen).toHaveLength(1);
  });

  it('restores the original methods on uninstall', () => {
    const patched = console.log;
    uninstall();
    expect(console.log).not.toBe(patched);

    seen = [];
    console.log('after');
    expect(seen).toHaveLength(0);
    uninstall = () => {};
  });
});
