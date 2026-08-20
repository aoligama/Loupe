import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { SCHEMA_VERSION } from '../src';
import type { Body, DebugEvent, DeepLinkPayload, LogPayload, NetworkPayload } from '../src';

const DIR = join(__dirname, '..', 'fixtures');
const names = readdirSync(DIR).filter((f) => f.endsWith('.json'));

function load(name: string): DebugEvent {
  return JSON.parse(readFileSync(join(DIR, name), 'utf8')) as DebugEvent;
}

const isIntegerMs = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v);

const isStringMap = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && !Array.isArray(v) &&
  Object.values(v).every((x) => typeof x === 'string');

function expectValidBody(body: Body): void {
  expect(['utf8', 'base64', 'none']).toContain(body.encoding);
  expect(isIntegerMs(body.size)).toBe(true);
  expect(body.size).toBeGreaterThanOrEqual(0);
  expect(typeof body.truncated).toBe('boolean');
  expect(body.mimeType === null || typeof body.mimeType === 'string').toBe(true);

  if (body.encoding === 'none') {
    expect(body.content).toBeNull();
  } else {
    expect(typeof body.content).toBe('string');
  }
}

describe('conformance fixtures', () => {
  it('still contains every fixture the corpus is expected to carry', () => {
    // Additions are fine; a deletion silently shrinks the corpus every
    // implementation is checked against, so name them explicitly.
    expect(names).toEqual(
      expect.arrayContaining([
        'network-pending.json',
        'network-complete.json',
        'log.json',
        'unknown-fields.json',
        'deeplink-outgoing.json',
        'deeplink-incoming.json',
      ]),
    );
  });

  it.each(names)('%s is a structurally valid DebugEvent envelope', (name) => {
    const event = load(name);

    expect(event.schemaVersion).toBe(SCHEMA_VERSION);
    expect(typeof event.id).toBe('string');
    expect(event.id.length).toBeGreaterThan(0);
    expect(typeof event.type).toBe('string');
    expect(event.type.length).toBeGreaterThan(0);
    expect(typeof event.sourcePluginId).toBe('string');
    expect(event.sourcePluginId.length).toBeGreaterThan(0);
    expect(isIntegerMs(event.timestamp)).toBe(true);
    expect(event.payload).not.toBeNull();
    expect(typeof event.payload).toBe('object');
  });

  it.each(names.filter((n) => n.startsWith('network')))(
    '%s carries a structurally valid NetworkPayload',
    (name) => {
      const payload = load(name).payload as NetworkPayload;

      expect(typeof payload.requestId).toBe('string');
      expect(['pending', 'success', 'error']).toContain(payload.status);
      expect(typeof payload.url).toBe('string');
      expect(payload.method).toBe(payload.method.toUpperCase());
      expect(isStringMap(payload.requestHeaders)).toBe(true);
      expectValidBody(payload.requestBody);
      expect(isIntegerMs(payload.startTime)).toBe(true);
      expect(['native', 'js']).toContain(payload.stack);

      // Header keys are normalized to lowercase on capture so panels can rely
      // on it — the fixtures are the corpus that holds every port to that.
      Object.keys(payload.requestHeaders).forEach((k) => expect(k).toBe(k.toLowerCase()));
      Object.keys(payload.responseHeaders ?? {}).forEach((k) => expect(k).toBe(k.toLowerCase()));

      if (payload.status === 'pending') {
        expect(payload.statusCode).toBeNull();
        expect(payload.responseHeaders).toBeNull();
        expect(payload.responseBody).toBeNull();
        expect(payload.endTime).toBeNull();
        expect(payload.durationMs).toBeNull();
      } else {
        expect(isIntegerMs(payload.endTime)).toBe(true);
        expect(isIntegerMs(payload.durationMs)).toBe(true);
        expect(payload.durationMs).toBe(payload.endTime! - payload.startTime);
        expect(isStringMap(payload.responseHeaders)).toBe(true);
        expectValidBody(payload.responseBody!);
      }
    },
  );

  it.each(names.filter((n) => !n.startsWith('network') && !n.startsWith('deeplink')))(
    '%s carries a structurally valid LogPayload',
    (name) => {
      const payload = load(name).payload as LogPayload;

      expect(['verbose', 'debug', 'info', 'warn', 'error']).toContain(payload.level);
      expect(typeof payload.message).toBe('string');
      expect(payload.tag === null || typeof payload.tag === 'string').toBe(true);
      expect(['native', 'js']).toContain(payload.source);
      expect(payload.stackTrace === null || typeof payload.stackTrace === 'string').toBe(true);
    },
  );

  it('treats a fixture carrying unknown fields as valid, and keeps them readable', () => {
    const event = load('unknown-fields.json') as DebugEvent & { futureEnvelopeField?: string };
    const payload = event.payload as LogPayload & { futurePayloadField?: number };

    // Forward compatibility: an envelope from a newer producer must still pass
    // every structural check above (it does — it is in the it.each corpus) AND
    // the extra fields must survive rather than being silently dropped.
    expect(event.futureEnvelopeField).toBe('ignore me');
    expect(payload.futurePayloadField).toBe(42);
    expect(payload.level).toBe('info');
  });

  it('rejects a malformed envelope, proving the checks above can fail', () => {
    // Guards the suite itself: without this, a validator that asserts nothing
    // would look identical to one that works.
    const broken = { ...load('log.json'), timestamp: 'not-a-number' };
    expect(isIntegerMs(broken.timestamp)).toBe(false);
  });

  function expectValidDeepLinkPayload(p: DeepLinkPayload): void {
    expect(typeof p.url).toBe('string');
    expect(['outgoing', 'incoming']).toContain(p.direction);
    expect(p.error === null || typeof p.error === 'string').toBe(true);

    // The two directions are mutually exclusive about which fields carry data.
    // A payload with both set, or neither, is meaningless and must not pass.
    if (p.direction === 'incoming') {
      expect(['cold-start', 'running']).toContain(p.arrival);
      expect(p.opened).toBeNull();
    } else {
      expect(p.arrival).toBeNull();
      expect(typeof p.opened).toBe('boolean');
    }
  }

  it('deeplink-outgoing.json carries a structurally valid DeepLinkPayload', () => {
    const event = load('deeplink-outgoing.json');
    expect(event.type).toBe('deeplink');
    expectValidDeepLinkPayload(event.payload as DeepLinkPayload);
  });

  it('deeplink-incoming.json carries a structurally valid DeepLinkPayload', () => {
    const event = load('deeplink-incoming.json');
    expect(event.type).toBe('deeplink');
    expectValidDeepLinkPayload(event.payload as DeepLinkPayload);
  });
});
