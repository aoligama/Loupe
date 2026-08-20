import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', 'src');

/**
 * Comments are stripped before asserting. Every one of these files explains the
 * __DEV__ trap it is guarding against, so matching raw text would fail on the
 * prose describing the rule rather than on a violation of it.
 */
const read = (p: string) =>
  readFileSync(join(SRC, p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

/**
 * The two entry points differ in exactly one way: index gates everything behind
 * __DEV__, release gates nothing. Both sit on the same implementation.
 *
 * These are source-shape assertions rather than behavioural ones, because the
 * property being protected is a bundling property. Jest cannot observe what
 * Metro folds away — that is what scripts/verify-release-strip.sh and
 * scripts/verify-release-entry.sh are for. What jest CAN do is catch the
 * mistakes that lead there, at the point someone makes them.
 */
describe('the release entry', () => {
  it('reaches the implementation without a __DEV__ gate', () => {
    const release = read('release.tsx');

    expect(release).toMatch(/from '\.\/impl'/);
    // A gate here would strip the overlay from the very build this entry
    // exists to serve.
    expect(release).not.toMatch(/__DEV__/);
  });

  it('does not start on import', () => {
    // A production build that activates a debug overlay because a module was
    // imported is a footgun. The host calls startLoupe explicitly — which it
    // must do anyway to pass storage adapters.
    expect(read('release.tsx')).not.toMatch(/^\s*startLoupe\(\)/m);
  });
});

describe('the implementation module', () => {
  it('contains no build-mode gating at all', () => {
    // If a __DEV__ check creeps in here, the release entry silently loses
    // whatever it guards. The failure looks like a working overlay with an
    // invisible UI, not like an error.
    expect(read('impl.tsx')).not.toMatch(/__DEV__/);
  });

  it('mounts the overlay itself rather than leaving it to an entry point', () => {
    // setWrapperComponentProvider is the only route the bubble has onto the
    // screen. Left in an entry point, the release build would install capture,
    // register panels, and render nothing.
    expect(read('impl.tsx')).toMatch(/setWrapperComponentProvider/);
    expect(read('index.tsx')).not.toMatch(/setWrapperComponentProvider/);
    expect(read('release.tsx')).not.toMatch(/setWrapperComponentProvider/);
  });
});

describe('the dev entry', () => {
  it('reaches the implementation only through lazy requires inside __DEV__', () => {
    const index = read('index.tsx');

    // A single module-scope import of ./impl would undo the stripping for
    // every consumer, and the marker check would not necessarily notice.
    expect(index).not.toMatch(/^import .*from '\.\/impl'/m);
    expect(index).toMatch(/require\('\.\/impl'\)/);
  });

  it('puts every require inside an if (__DEV__) block, never after a negated guard', () => {
    // Metro only deletes the body of a folded `if (__DEV__)`. Code following an
    // `if (!__DEV__) return|throw` stays textually present and its requires are
    // still collected — that mistake shipped 1.5KB while the marker check
    // stayed green.
    const index = read('index.tsx');

    expect(index).not.toMatch(/if \(!__DEV__\)/);
  });
});
