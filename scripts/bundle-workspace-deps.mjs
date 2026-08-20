#!/usr/bin/env node
/**
 * Inlines @loupe/core and @loupe/contract into react-native-loupe's build.
 *
 * Published on their own they would be two more packages to version in
 * lockstep, and consumers would gain nothing: the native slices read the
 * contract from this repo, not from npm. Left as `workspace:*` they would be
 * rewritten to a version that does not exist on the registry, and every
 * install would fail.
 *
 * So the built output is folded in. This runs after `bob build`, over `lib`
 * only — the source keeps importing '@loupe/core' as it always has, so the
 * monorepo still has one copy of that code and nothing here changes how the
 * package is developed or tested.
 *
 * The runtime surface is tiny: exactly two require() calls reach @loupe/core
 * and none reach @loupe/contract, whose exports are types and erase at compile
 * time. The .d.ts files are the bulk of the rewriting.
 */
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const RN = join(ROOT, 'packages/react-native');
const TARGETS = ['commonjs', 'module', 'typescript'];
const PACKAGES = { '@loupe/core': 'core', '@loupe/contract': 'contract' };

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

let rewrites = 0;

for (const target of TARGETS) {
  const targetDir = join(RN, 'lib', target);
  if (!existsSync(targetDir)) continue;

  const vendorDir = join(targetDir, '_vendor');
  for (const [spec, name] of Object.entries(PACKAGES)) {
    const built = join(ROOT, 'packages', name, 'lib');
    if (!existsSync(built)) {
      throw new Error(`${spec} has no build at ${built}. Run its build first.`);
    }
    cpSync(built, join(vendorDir, name), { recursive: true });
  }

  for (const file of walk(targetDir)) {
    if (!/\.(js|mjs|cjs|ts|map)$/.test(file)) continue;

    const before = readFileSync(file, 'utf8');
    let after = before;

    for (const [spec, name] of Object.entries(PACKAGES)) {
      // Relative from THIS file to the vendored copy. Depth varies — lib/
      // commonjs/index.js and lib/commonjs/capture/body.js need different
      // prefixes — so it is computed per file rather than assumed.
      let rel = relative(dirname(file), join(vendorDir, name)).replace(/\\/g, '/');
      if (!rel.startsWith('.')) rel = `./${rel}`;

      after = after.split(`'${spec}'`).join(`'${rel}'`).split(`"${spec}"`).join(`"${rel}"`);
    }

    if (after !== before) {
      writeFileSync(file, after);
      rewrites += 1;
    }
  }
}

// A missed specifier means an install that resolves a package the tarball does
// not carry, which fails at require time in the consumer's app rather than
// here. Fail the build instead.
const leaked = walk(join(RN, 'lib')).filter(
  (f) => /\.(js|mjs|cjs|ts)$/.test(f) && /['"]@loupe\//.test(readFileSync(f, 'utf8')),
);

if (leaked.length > 0) {
  console.error('FAIL: @loupe/* specifiers survived bundling in:');
  for (const f of leaked) console.error(`  ${relative(ROOT, f)}`);
  process.exit(1);
}

console.log(`Inlined @loupe/core and @loupe/contract into lib (${rewrites} files rewritten).`);
