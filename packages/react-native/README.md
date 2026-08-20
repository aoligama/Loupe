# react-native-loupe

An on-device debug overlay for React Native. Network, logs, storage, and deep
links, inspected inside your own app — no desktop client, no cable.

## Install

```sh
npm install --save-dev react-native-loupe
```

Add one line as the **first line** of `index.js`:

```js
import 'react-native-loupe';
```

That gives you the network, log and deeplink panels with nothing else to do.
Loupe patches the JS interceptors and wraps your root component automatically.
Release builds ship nothing — everything sits behind `__DEV__` and Metro strips
it.

Storage and shake need one more line each, because Loupe will not reach for a
package you might not have installed — see [Optional backends](#optional-backends).

## Opening the overlay

- **Bubble** — a draggable handle, on by default.
- **Dev menu** — Loupe adds an "Open Loupe" entry, which shake already opens.
  This is the default and needs nothing installed.
- **Shake** — for a real shake gesture, hand Loupe a sensor package you have
  installed:

  ```js
  import Shake from 'react-native-shake';
  import { startLoupe, createShakeSource } from 'react-native-loupe';

  startLoupe({ shake: { source: createShakeSource(Shake) } });
  ```

## Running Loupe in a release build

The default entry ships nothing into a release build — that is its whole point.
When you want the overlay in front of testers on TestFlight or an internal
track, import the release entry instead:

```js
import { startLoupe, createKeychainAdapter } from 'react-native-loupe/release'
import * as Keychain from 'react-native-keychain'

startLoupe({
  shake: false,
  storageAdapters: [createKeychainAdapter(Keychain)],
})
```

Only import it from a build you intend to hand to people who should see it: the
panels display network bodies, stored values and logs.

Unlike the default entry, this one does **not** start on import. A production
build that activates a debug overlay because a module was imported is a
footgun, and you have to call `startLoupe` anyway to pass storage adapters.

Two things behave differently in a release build, neither of them a defect:

- **Shake does nothing** unless you supply a source. The fallback is the React
  Native dev menu, which does not exist in a release build. Pass `shake: false`
  to be explicit.
- **Error stacks are minified.** Log entries at error level carry a Hermes
  stack, which is mangled unless the build is symbolicated. The log panel is
  weaker there than in development.

## Optional backends

Loupe requires no optional package of its own, and this is deliberate rather
than lazy. Under Metro, `require()`ing a dependency the app has not installed
does not fail softly: the module's dependency-map slot is `undefined` and the
call throws `Requiring unknown module "undefined"` — uncaught, straight through
the `try/catch` that was supposed to make it optional. Loupe probing for a
package it did not own crashed the storage panel, and the same shape in shake
detection would have crashed the host app on import.

Checking for the native module first does not rescue it. The legacy
`NativeModules` proxy reports nothing at all under the New Architecture, and
`TurboModuleRegistry` needs a per-package module name that cannot be verified
for a package that is not installed.

So you pass the module in. Your import is static, Metro resolves it normally,
and the dependency belongs to the app that actually installed it:

```js
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import {
  startLoupe,
  createAsyncStorageAdapter,
  createKeychainAdapter,
} from 'react-native-loupe';

startLoupe({
  storageAdapters: [
    createAsyncStorageAdapter(AsyncStorage),
    createKeychainAdapter(Keychain),
  ],
});
```

Put the whole block inside `if (__DEV__)` and require it lazily, as
`example/index.js` does, so Metro strips both the wiring and the packages from
release builds.

| Factory                      | Package                                        |
| ---------------------------- | ---------------------------------------------- |
| `createAsyncStorageAdapter`  | `@react-native-async-storage/async-storage`     |
| `createMmkvAdapter`          | `react-native-mmkv` (v2, v3 and v4)             |
| `createKeychainAdapter`      | `react-native-keychain`                         |
| `createShakeSource`          | `react-native-shake`                            |

Anything satisfying the `StorageAdapter` interface works, so your own storage
layer can appear in the panel too.

## Configuration

Call `startLoupe` from your own startup code to override the defaults:

```js
import { startLoupe } from 'react-native-loupe';

startLoupe({
  bubble: true,
  shake: { threshold: 2.2, requiredHits: 4, source: mySource },
  storageAdapters: [myAdapter],
  bodyCapBytes: 512 * 1024,
  buffers: { network: { byteBudget: 64 * 1024 * 1024 } },
});
```

| Buffer  | Strategy    | Count cap | Byte budget |
| ------- | ----------- | --------- | ----------- |
| log     | append      | 2000      | 8 MB        |
| network | upsertByKey | 500       | 32 MB       |
| custom  | append      | 1000      | 8 MB        |

## Storage panel

Shows whatever backends you passed to `startLoupe({ storageAdapters })` — see
[Optional backends](#optional-backends). Values are editable, filterable by key,
and destructive actions are confirm-gated.

An adapter can mark itself `sensitive`, and `createKeychainAdapter` does. Its
values are masked until you tap to reveal one, and copy stays hidden until then:
these are auth tokens, and a dev build gets screen-shared.

Values that parse as JSON render as a collapsible tree with a `raw` toggle for
the exact bytes. Copy always hands over the original string, never the
reformatted one.

## Network panel

Requests, with the body, headers and timing of each.

GraphQL gets first-class treatment, because an app that speaks GraphQL POSTs
everything to one URL — without it every row reads the same and the list is
useless for finding anything:

- Rows are titled by **operation name**, with a `QRY` / `MUT` / `SUB` label in
  place of the verb that is always `POST`. Filtering matches the operation name.
- A response carrying an `errors` array reads **`200 · 1 err`** in the error
  colour, and the detail view leads with the errors. A GraphQL failure is an
  HTTP 200, so a status code alone shows a failed operation as a success — the
  most misleading thing a network panel can do for this kind of app.
- Variables and the operation type are shown alongside the request.

**Copy as curl** rebuilds a request as a runnable command. Credentials are
redacted by default: curl commands get pasted into terminals, tickets and
chats, and for most apps the `Authorization` header is a live session token.

JSON bodies render as a collapsible tree with `expand all`, a `raw` toggle for
the exact bytes, and long string values that reveal in full on tap.

## Deeplink panel

Keeps a list of deep links you can fire from inside the app, and records every
link the app receives — including the one that cold-started it. A fired link and
its arrival sit next to each other on one timeline, so you can see whether a
redirect actually landed.

Links you add are persisted under the key `loupe:deeplinks` through the first
storage adapter you registered, and kept in memory if you registered none. The
panel itself needs nothing installed: `Linking` is part of React Native.

On iOS, receiving a link while the app is already running additionally needs
`RCTLinkingManager` wired into your `AppDelegate` — registering a URL scheme
alone only covers cold start, and the running-app case fails silently. See
`example/ios/LoupeExample/AppDelegate.mm`.

## Writing your own tool

The four built-ins are registered through this same API:

```tsx
import { registerTool } from 'react-native-loupe';

registerTool({
  id: 'my-tool',
  title: 'my tool',
  icon: { glyph: '★' },
  Panel: ({ bus }) => {
    const events = bus.history('my-type');
    return <MyView events={events} />;
  },
});
```

Emit your own events onto the same bus and they land in a ring buffer with the
same retention rules. `network`, `log`, `storage`, and `deeplink` are reserved ids.

## If your wrapper slot is taken

Loupe uses `AppRegistry.setWrapperComponentProvider`, which is
single-occupancy. If your app already uses it, disable the automatic wrapper by
mounting the root yourself:

```tsx
import { LoupeRoot, getBus } from 'react-native-loupe';

// getBus() is non-null once Loupe has started (automatically in __DEV__, or
// after your own startLoupe() call), which is always true by the time your
// root component renders.
<LoupeRoot bus={getBus()!}>{children}</LoupeRoot>
```
