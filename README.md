# Loupe

An on-device debug overlay. Network, logs, storage, and deep links, inspected inside the app
you are building — no desktop client, no cable.

Loupe is designed as three implementations behind one wire contract:

| Slice                     | Status                   |
| ------------------------- | ------------------------ |
| React Native / TypeScript | v0                       |
| iOS / Swift               | planned                  |
| Android / Kotlin          | planned                  |

The contract lives in `packages/contract` as wire types and JSON fixtures each
implementation must round-trip, so "the three agree" is a test rather than an
intention.

## Packages

- **`packages/contract`** — wire types and conformance fixtures.
- **`packages/core`** — EventBus and ring buffer. Pure TypeScript, no React or
  React Native imports, so the native ports have a reference to mirror.
- **`packages/react-native`** — [`react-native-loupe`](packages/react-native/README.md).
  Capture, overlay, and the four built-in panels.

## Development

```sh
pnpm install
pnpm test              # every package
pnpm typecheck         # strict TypeScript across the workspace
pnpm verify:release    # proves release builds ship no Loupe code
pnpm verify:peers      # proves no module name reaches Metro as a variable
pnpm verify:absent     # proves Loupe requires no package the host may not have
```

The three `verify:*` scripts exist because each guards something no unit test
can observe. They check a real Metro bundle, or the library's source, for
properties that are invisible under jest — every one of them was added after a
bug that shipped with a green suite.
