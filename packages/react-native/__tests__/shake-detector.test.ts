import { ShakeDetector } from '../src/shake/detector';

const STILL = { x: 0, y: 0, z: 1 };   // ~1g at rest
const SHAKEN = { x: 2, y: 2, z: 1 };  // magnitude 3

describe('ShakeDetector', () => {
  it('does not fire while the device is at rest', () => {
    const d = new ShakeDetector();
    for (let t = 0; t < 2000; t += 50) {
      expect(d.push(STILL, t)).toBe(false);
    }
  });

  it('does not fire on a single spike', () => {
    const d = new ShakeDetector();
    expect(d.push(SHAKEN, 0)).toBe(false);
  });

  it('fires once enough hits land inside the window', () => {
    const d = new ShakeDetector();
    expect(d.push(SHAKEN, 0)).toBe(false);
    expect(d.push(SHAKEN, 100)).toBe(false);
    expect(d.push(SHAKEN, 200)).toBe(true);
  });

  it('does not fire when hits are spread beyond the window', () => {
    const d = new ShakeDetector({ windowMs: 500 });
    expect(d.push(SHAKEN, 0)).toBe(false);
    expect(d.push(SHAKEN, 400)).toBe(false);
    expect(d.push(SHAKEN, 900)).toBe(false);
  });

  it('debounces a second fire immediately after the first', () => {
    const d = new ShakeDetector({ debounceMs: 1000 });
    d.push(SHAKEN, 0);
    d.push(SHAKEN, 100);
    expect(d.push(SHAKEN, 200)).toBe(true);

    expect(d.push(SHAKEN, 300)).toBe(false);
    expect(d.push(SHAKEN, 400)).toBe(false);
    expect(d.push(SHAKEN, 500)).toBe(false);
  });

  it('fires again once the debounce has elapsed', () => {
    const d = new ShakeDetector({ debounceMs: 1000 });
    [0, 100, 200].forEach((t) => d.push(SHAKEN, t));

    expect(d.push(SHAKEN, 1300)).toBe(false);
    expect(d.push(SHAKEN, 1400)).toBe(false);
    expect(d.push(SHAKEN, 1500)).toBe(true);
  });

  it('honours a raised threshold', () => {
    const d = new ShakeDetector({ threshold: 10 });
    [0, 100, 200].forEach((t) => expect(d.push(SHAKEN, t)).toBe(false));
  });

  it('honours a lowered hit requirement', () => {
    const d = new ShakeDetector({ requiredHits: 1 });
    expect(d.push(SHAKEN, 0)).toBe(true);
  });

  it('reset clears accumulated hits', () => {
    const d = new ShakeDetector();
    d.push(SHAKEN, 0);
    d.push(SHAKEN, 100);
    d.reset();
    expect(d.push(SHAKEN, 200)).toBe(false);
  });
});
