const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * The example app lives inside the Loupe pnpm workspace and consumes
 * react-native-loupe via `workspace:*`. With `node-linker=hoisted`, most
 * packages live in the workspace root's node_modules, not example/'s own —
 * so Metro needs to watch the workspace root and search its node_modules,
 * not just the example project's.
 *
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    // react-native-loupe is installed as an injected (copied, not symlinked)
    // dependency so its dynamic `require()` calls resolve as "in a package"
    // for Metro's dynamic-require check — but its own workspace deps
    // (@loupe/core, @loupe/contract) aren't copied along with it. Point
    // Metro straight at their real source so resolution doesn't depend on
    // how pnpm happens to link them.
    extraNodeModules: {
      '@loupe/core': path.resolve(workspaceRoot, 'packages/core'),
      '@loupe/contract': path.resolve(workspaceRoot, 'packages/contract'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
