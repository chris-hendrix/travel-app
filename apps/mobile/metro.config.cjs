/* global __dirname:readonly */
// Verified against installed nativewind@5.0.0-rc.0 typings:
//  - canonical export is `withNativewind` (`withNativeWind` is a deprecated alias)
//  - options are WithReactNativeCSSOptions, which has NO `input` key (v4 API).
//    The CSS entry is picked up via `import "../global.css"` in app/_layout.tsx.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// PROVISIONAL — leave commented out initially. Enable only if duplicate-module
// errors appear (e.g. two React copies). It narrows resolution to exactly the
// two paths above, which is brittle under pnpm's symlinked .pnpm/ layout.
// config.resolver.disableHierarchicalLookup = true;

module.exports = withNativewind(config);
