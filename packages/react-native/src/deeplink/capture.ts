import { Linking } from 'react-native';
import type { DebugEvent, DeepLinkPayload } from '@loupe/contract';
import type { EventBus } from '@loupe/core';
import { nextId } from '../capture/ids';

export const PLUGIN_ID = 'deeplink';

function emit(bus: EventBus, payload: DeepLinkPayload): void {
  const event: DebugEvent = {
    schemaVersion: 0, // stamped by the bus
    id: nextId('evt'),
    type: PLUGIN_ID,
    timestamp: Date.now(),
    sourcePluginId: PLUGIN_ID,
    payload,
  };
  bus.emit(event);
}

/**
 * Record a link the panel fired. Lives here rather than in the panel so both
 * directions build their envelope in one place and cannot drift apart.
 */
export function emitOutgoing(
  bus: EventBus,
  url: string,
  opened: boolean,
  error: string | null,
): void {
  emit(bus, { url, direction: 'outgoing', arrival: null, opened, error });
}

/**
 * Record every deep link the app receives.
 *
 * Two sources, and both are needed: the `url` event fires only while the app is
 * already running, so a link that cold-started the app is invisible to it and
 * has to be read separately from getInitialURL().
 */
export function installDeepLinkCapture(bus: EventBus): () => void {
  let live = true;

  const sub = Linking.addEventListener('url', ({ url }: { url: string }) => {
    if (!live) return;
    emit(bus, { url, direction: 'incoming', arrival: 'running', opened: null, error: null });
  });

  // Resolves on a later tick, which may be after teardown — `live` is what
  // stops a late resolution pushing an event into a torn-down bus.
  void Linking.getInitialURL()
    .then((url) => {
      if (!live || !url) return;
      emit(bus, { url, direction: 'incoming', arrival: 'cold-start', opened: null, error: null });
    })
    .catch(() => {
      // A platform that cannot answer is not an error worth surfacing; the
      // running-app listener above is unaffected.
    });

  return () => {
    live = false;
    sub.remove();
  };
}
