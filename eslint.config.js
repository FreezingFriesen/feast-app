// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

// The Firebase SDK stays behind our own interfaces (see CLAUDE.md), so moving to React
// Native Firebase later only changes these files.
const FIREBASE_SDK = {
  group: ["firebase", "firebase/*", "@firebase/*"],
  message:
    "Only src/services/firebase/, the five firebase*.ts services, src/testing/ and firestore-tests/ may import the Firebase SDK.",
};

// The admin SDK skips the Security Rules, so it must never reach the app.
const FIREBASE_ADMIN = {
  group: ["firebase-admin", "firebase-admin/*"],
  message: "Only scripts/ may import firebase-admin.",
};

const restrict = (...patterns) => ({ "no-restricted-imports": ["error", { patterns }] });

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*"],
  },
  // Everywhere: neither SDK.
  {
    rules: restrict(FIREBASE_SDK, FIREBASE_ADMIN),
  },
  // The places allowed to use the Firebase SDK.
  {
    files: [
      "src/services/firebase/**",
      "src/services/auth/firebaseAuthService.ts",
      "src/services/usernames/firebaseUsernameRegistry.ts",
      "src/services/profiles/firebaseRemoteProfileStore.ts",
      "src/services/userData/firebaseRemoteUserContent.ts",
      "src/services/userData/firebaseRemoteContentStore.ts",
      "src/testing/**",
      "firestore-tests/**",
    ],
    rules: restrict(FIREBASE_ADMIN),
  },
  // The one place allowed to use the admin SDK.
  {
    files: ["scripts/**"],
    rules: restrict(FIREBASE_SDK),
  },
]);
