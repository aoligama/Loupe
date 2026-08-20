---
title: "Loupe: a debug overlay that lives inside your React Native app"
published: false
description: "Network, logs, storage, and deep links, inspected on-device. No desktop client, no cable. Here's why I built it and how it works."
tags: reactnative, javascript, devtools, opensource
canonical_url:
cover_image: https://raw.githubusercontent.com/aoligama/Loupe/master/docs/media/cover.png
---

The last bug I chased in a React Native app only showed up on a real device, on cellular, in a TestFlight build. So I plugged the phone in, opened a desktop debugger, and got nothing. The network tab sat there blank. Whatever I needed to see was happening inside an app I couldn't attach to.

That's the gap I kept falling into. The good debugging tools live on my laptop, and the interesting bugs live on someone else's phone. So I built [**Loupe**](https://www.npmjs.com/package/react-native-loupe), an on-device debug overlay for React Native. It shows you network, logs, storage, and deep links right inside the app you're building. No desktop client, no cable.

## One line to start

You add Loupe as the **first line** of `index.js`:

```js
import 'react-native-loupe';
```

That's the whole setup for the network, log, and deep link panels. Loupe patches the JS network interceptors and wraps your root component for you, and a draggable bubble shows up to open the overlay. Nothing to configure, nothing to remember to turn off. Release builds ship none of it: everything sits behind `__DEV__`, and Metro strips it out of production bundles.

<p align="center">
  <img src="https://raw.githubusercontent.com/aoligama/Loupe/master/docs/media/overlay-bubble.png" width="300" alt="The Loupe bubble floating over the example app">
  <img src="https://raw.githubusercontent.com/aoligama/Loupe/master/docs/media/launcher.png" width="300" alt="The launcher listing the four built-in panels">
</p>

That last part mattered to me more than any single feature. A debug tool that can leak into a release build isn't a debug tool, it's a liability. So the default entry point is inert in production by construction, not by discipline.

## The network panel speaks GraphQL

This is the part I'm proudest of. It's what made Loupe better than the built-in inspector for the apps I actually work on.

If your app speaks GraphQL, every request is a `POST` to the same URL. Open a normal network inspector and you get thirty identical-looking rows. Finding the one you care about means opening each one. That list is useless.

<p align="center">
  <img src="https://raw.githubusercontent.com/aoligama/Loupe/master/docs/media/network-panel.png" width="330" alt="Request list: GraphQL rows titled by operation name, with BadOperation reading 200 · 1 err in red">
</p>

Loupe treats GraphQL as a first-class citizen:

- Rows are titled by **operation name**, with a `QRY` / `MUT` / `SUB` label where the verb would go (it's always `POST` anyway). Filtering matches the operation name.
- A response that carries an `errors` array reads **`200 · 1 err`** in the error color, and the detail view leads with the errors. This one is easy to underestimate. A GraphQL failure is an HTTP `200`, so a status-code-only view shows a *failed* operation as a green success. That's the most misleading thing a network panel can do for a GraphQL app, and I wanted it fixed.

<p align="center">
  <img src="https://raw.githubusercontent.com/aoligama/Loupe/master/docs/media/network-graphql-error.png" width="330" alt="Detail view leading with the GraphQL errors array, status 200 · 1 err, and copy as curl">
</p>

Every request also has **Copy as curl**, which rebuilds it as a command you can actually run. Credentials are redacted by default, because curl commands end up pasted into tickets and chat threads, and for most apps the `Authorization` header is a live session token. JSON bodies render as a collapsible tree, with a `raw` toggle when you want the exact bytes.

## Storage you can actually edit

The storage panel shows whatever backends you hand it, and lets you edit values in place, filter by key, and delete (behind a confirm). Values that parse as JSON render as a collapsible tree.

<p align="center">
  <img src="https://raw.githubusercontent.com/aoligama/Loupe/master/docs/media/storage-json.png" width="300" alt="A stored JSON value rendered as a collapsible tree">
  <img src="https://raw.githubusercontent.com/aoligama/Loupe/master/docs/media/storage-keychain-masked.png" width="300" alt="A keychain value masked until tapped, with copy hidden">
</p>

It also knows some values are dangerous to show. An adapter can mark itself `sensitive`, and the keychain adapter does. Its values stay masked until you tap to reveal one, and copy stays disabled until then. These are auth tokens, and a dev build gets screen-shared in standups.

## Why Loupe asks for nothing

Here's a decision that took me a while to get right. Loupe requires **no optional dependency of its own**, and that's deliberate rather than lazy.

My first instinct was the obvious one. Wrap the `require()` for a package like AsyncStorage in a `try/catch`, and if it isn't there, skip that panel. Under Metro, that doesn't work the way you'd hope. Requiring a module the app hasn't installed doesn't fail softly. Its slot in the dependency map is `undefined`, and the call throws `Requiring unknown module "undefined"`, uncaught, straight through the `try/catch` that was supposed to make it optional. Loupe probing for a package it didn't own crashed the storage panel. The same pattern in shake detection would have crashed the host app on import.

Checking for the native module first doesn't save you either. The legacy `NativeModules` proxy reports nothing under the New Architecture, and `TurboModuleRegistry` needs a per-package module name you can't verify for a package that isn't installed.

So Loupe inverts it. You pass the module in:

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

Your import is static, Metro resolves it normally, and the dependency belongs to the app that actually installed it. Loupe never guesses. There are ready-made adapters for AsyncStorage, MMKV (v2 to v4), Keychain, and shake detection, and anything that satisfies the `StorageAdapter` interface works too, including your own storage layer.

## Deep links, both directions

The deep link panel keeps a list of links you can fire from inside the app, and it records every link the app *receives*, including the one that cold-started it. A link you fired and its arrival sit next to each other on one timeline, so you can actually tell whether a redirect landed. The panel needs nothing installed; `Linking` ships with React Native.

<p align="center">
  <img src="https://raw.githubusercontent.com/aoligama/Loupe/master/docs/media/deeplink-panel.png" width="330" alt="Deeplink panel listing saved links, each with a fire and a remove control">
</p>

## Getting it in front of testers

The default entry ships nothing to production. But sometimes you *want* the overlay in a TestFlight build, in front of testers. For that, there's a separate entry point:

```js
import { startLoupe, createKeychainAdapter } from 'react-native-loupe/release'
import * as Keychain from 'react-native-keychain'

startLoupe({
  shake: false,
  storageAdapters: [createKeychainAdapter(Keychain)],
})
```

Unlike the default, this one does *not* start on import. A production build that fires up a debug overlay just because a module got imported is a footgun. You opt in explicitly, from a build you mean to hand to people who should see it.

## Bring your own tool

The four built-in panels are all registered through the same public API, so you can add your own:

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

Emit your own events onto the same bus and they land in a ring buffer with the same retention rules as everything else.

## Try it

```sh
npm install --save-dev react-native-loupe
```

Then one line at the top of `index.js` and you have the overlay. Loupe is MIT-licensed and open source.

- **npm:** [react-native-loupe](https://www.npmjs.com/package/react-native-loupe)
- **GitHub:** [aoligama/Loupe](https://github.com/aoligama/Loupe)

If you try it, I'd love to hear what panel you end up wanting next. The extensibility API exists because I already know four won't be enough.
