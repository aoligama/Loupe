import type { DebugEvent, LogPayload } from '@loupe/contract';
import type { EventBus } from '@loupe/core';
import { nextId } from './ids';

const PLUGIN_ID = 'log';

const LEVELS: Record<string, LogPayload['level']> = {
  log: 'info',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  trace: 'verbose',
};

function render(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return '[unserializable]';
  }
}

export function installLogCapture(bus: EventBus): () => void {
  const methods = Object.keys(LEVELS) as Array<keyof typeof LEVELS>;
  const originals: Record<string, (...args: unknown[]) => void> = {};
  // Tracks the exact patched function we installed per method, so uninstall
  // can tell whether it is still in place before touching console.
  const patchedFns: Record<string, (...args: unknown[]) => void> = {};

  // Guards against the obvious footgun: a panel or subscriber that logs would
  // otherwise re-enter capture and loop forever.
  let capturing = false;

  for (const method of methods) {
    const target = console as unknown as Record<string, (...args: unknown[]) => void>;
    const original = target[method];
    if (typeof original !== 'function') continue;
    originals[method] = original;

    const patched = function patchedConsoleMethod(...args: unknown[]) {
      // Capture bookkeeping must never stand between the app and its own
      // console output: the delegation below runs unconditionally, whether
      // this block is skipped (reentrancy), succeeds, or throws.
      if (!capturing) {
        capturing = true;
        try {
          const level = LEVELS[method]!;
          const errorArg = args.find((a): a is Error => a instanceof Error);
          const payload: LogPayload = {
            level,
            message: args.map(render).join(' '),
            tag: null,
            source: 'js',
            stackTrace:
              level === 'error' ? (errorArg?.stack ?? new Error().stack ?? null) : null,
            metadata: null,
          };
          const event: DebugEvent = {
            schemaVersion: 0, // stamped by the bus
            id: nextId('evt'),
            type: PLUGIN_ID,
            timestamp: Date.now(),
            sourcePluginId: PLUGIN_ID,
            payload,
          };
          bus.emit(event);
        } catch {
          // Capture must never break the app's own logging.
        } finally {
          capturing = false;
        }
      }
      return original.apply(console, args);
    };

    patchedFns[method] = patched;
    target[method] = patched;
  }

  return () => {
    const target = console as unknown as Record<string, unknown>;
    for (const [method, original] of Object.entries(originals)) {
      // Only restore if our patch is still the installed function. If
      // something else re-patched console[method] after us, blindly
      // overwriting here would silently discard that later patch.
      if (target[method] === patchedFns[method]) {
        target[method] = original;
      }
    }
  };
}
