import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EventBus } from '@loupe/core';

export function useEvents(bus: EventBus, type: string) {
  // A version counter, not a copy of the events. Subscribing bumps the
  // counter; the read happens once per render. React 18 batches state updates,
  // so a burst of 100 emits in one tick costs one history() read, not 100 —
  // while the store still owns coalescing, so the panel cannot drift from it.
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const sub = bus.subscribe(type, bump);
    // Catch anything emitted between the initial render and this subscription.
    bump();
    return () => sub.dispose();
  }, [bus, type, bump]);

  const events = useMemo(() => bus.history(type), [bus, type, version]);
  const dropped = useMemo(() => bus.droppedCount(type), [bus, type, version]);

  const clear = useCallback(() => {
    bus.clear(type);
    bump();
  }, [bus, type, bump]);

  return { events, dropped, clear };
}
