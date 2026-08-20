/**
 * @format
 */

import 'react-native-loupe';

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

if (__DEV__) {
  // Loupe requires none of these itself, on purpose. Under Metro an absent
  // optional dependency's slot is undefined and reaching the require throws an
  // uncaught error — it crashed the storage panel, and the same shape in shake
  // detection would have crashed the app on import. The host owns the imports
  // instead: these are static, Metro resolves them normally, and they belong to
  // the app that actually installed the packages.
  //
  // All of it sits inside `if (__DEV__)` so Metro strips the wiring and the
  // packages from release bundles.
  const {
    startLoupe,
    createAsyncStorageAdapter,
    createKeychainAdapter,
    createMmkvAdapter,
  } = require('react-native-loupe');

  const AsyncStorage = require('@react-native-async-storage/async-storage');
  const Keychain = require('react-native-keychain');
  const Mmkv = require('react-native-mmkv');

  // Three backends on purpose: the panel's adapter switcher is only really
  // exercised with more than one, and MMKV here is v4, whose createMMKV()
  // factory the adapter had to learn.
  startLoupe({
    storageAdapters: [
      createAsyncStorageAdapter(AsyncStorage),
      createMmkvAdapter(Mmkv),
      createKeychainAdapter(Keychain),
    ],
  });
}

AppRegistry.registerComponent(appName, () => App);
