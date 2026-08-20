# Contributing to Loupe

Thanks for looking. Loupe is a small project with a clear shape, and this file
is here so a change lands the same way twice.

## Before you open a PR

For anything larger than a typo, **open an issue first** so we can agree on the
approach before you spend time on it. A good bug report or a short "here's what
I'd add and why" saves a rewrite later. I'd rather talk about the idea than
send a PR back.

## Repo layout

Loupe is a pnpm workspace with three packages behind one wire contract:

- **`packages/contract`** — wire types and conformance fixtures. Changing the
  contract is a cross-cutting decision that affects every implementation, so
  open an issue before you do.
- **`packages/core`** — the EventBus and ring buffer. Pure TypeScript, no React
  or React Native imports, so the native ports have a reference to mirror. Keep
  it that way.
- **`packages/react-native`** — [`react-native-loupe`](packages/react-native/README.md):
  capture, overlay, and the four built-in panels.

## Getting set up

```sh
pnpm install
pnpm test        # every package
pnpm typecheck   # strict TypeScript across the workspace
```

The example app lives in `example/` and is the fastest way to see a change in a
running overlay.

## The `verify:*` scripts matter

```sh
pnpm verify:release   # proves release builds ship no Loupe code
pnpm verify:peers     # proves no module name reaches Metro as a variable
pnpm verify:absent    # proves Loupe requires no package the host may not have
```

These exist because each guards something no unit test can observe — they check
a real Metro bundle, or the library's source, for a property that is invisible
under jest. Every one of them was added after a bug that shipped with a green
suite. **If your change touches capture, imports, or the release entry, run
them and keep them green.** A PR that breaks one of these will be sent back even
if every unit test passes.

## Expectations for a change

- **Tests.** New behavior comes with a test. Bug fixes come with a test that
  fails before the fix.
- **`__DEV__` discipline.** The default entry must ship nothing into a release
  build. If you add anything that touches startup, confirm `pnpm verify:release`
  still passes.
- **No new required dependency.** Loupe reaches for nothing the host app has not
  installed — optional backends are passed in as adapters, never `require()`d
  speculatively. See [Optional backends](packages/react-native/README.md#optional-backends)
  for why. A PR that adds a hard dependency on an optional package won't merge.
- **Match the surrounding code.** Naming, comment density, and idiom. Read the
  file you're editing first.

## Writing a new panel

You don't need to fork Loupe to add a tool — `registerTool` is public API and
the four built-ins use it. If you've built a panel you think belongs in the box,
open an issue and show it. See
[Writing your own tool](packages/react-native/README.md#writing-your-own-tool).

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
