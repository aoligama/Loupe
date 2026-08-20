/**
 * @format
 */

import 'react-native';
import React from 'react';
import App from '../App';

// Note: import explicitly to use the types shipped with jest.
import {it} from '@jest/globals';

// Note: test renderer must be required after react-native.
import renderer, {act} from 'react-test-renderer';

it('renders correctly', () => {
  // App mounts an effect that subscribes to Linking. Without act(), that
  // effect never flushes before the test returns, and it can then fire after
  // Jest has torn the environment down for this file.
  act(() => {
    renderer.create(<App />);
  });
});
