// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite on web runs SQLite as WebAssembly inside a web worker, and the
// worker imports the .wasm file. Without this, Metro can't resolve the .wasm
// file, so the worker can't be bundled.
// The expo-sqlite *Sync APIs on web also need COOP/COEP headers (SharedArrayBuffer).
// We only use the async API, so the headers aren't set here.
config.resolver.assetExts.push("wasm");

module.exports = config;
