const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable package exports resolution so Metro uses CJS builds instead of
// ESM builds that contain import.meta (which breaks non-module script contexts).
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
