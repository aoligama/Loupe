let counter = 0;

/** Monotonic per-session id. Uniqueness within one app run is all we need. */
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
