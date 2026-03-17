const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname; // apps/mobile
const workspaceRoot = path.resolve(projectRoot, '../..'); // monorepo root

const config = getDefaultConfig(projectRoot);

// pnpm stores packages in a virtual store at the workspace root's node_modules.
// Metro must be able to follow symlinks from apps/mobile/node_modules → workspace node_modules.
// Adding workspaceRoot to watchFolders gives Metro access to the pnpm virtual store.
config.watchFolders = [
  workspaceRoot,
];

// Resolve modules from local node_modules first, fall back to workspace node_modules
// (required for pnpm hoisted packages).
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
  ],
  // Prefer the react-native build of packages (e.g. @firebase/auth uses RN-specific code).
  unstable_conditionNames: ['react-native', 'browser', 'require', 'default'],
};

module.exports = withNativeWind(config, { input: './global.css' });
