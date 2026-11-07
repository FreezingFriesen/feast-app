// Jest settings for the tests that need the Firebase emulators: npm run test:backend
// Plain npm test never picks these up (their names don't end in .test), so it needs no
// emulator and no Java. They run in plain Node, where the Firebase SDK talks to the
// emulators, with the same Babel preset the normal tests use for TypeScript.
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/testing/emulator/**/*.emulator.ts"],
  transform: {
    "\\.[jt]sx?$": [
      "babel-jest",
      {
        presets: [require.resolve("expo/internal/babel-preset.js")],
        caller: { name: "metro", bundler: "jest", platform: "web", isServer: true },
      },
    ],
  },
  transformIgnorePatterns: ["/node_modules/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // A real (emulated) server: slower than the in-memory tests, and one shared database.
  testTimeout: 120000,
  maxWorkers: 1,
};
