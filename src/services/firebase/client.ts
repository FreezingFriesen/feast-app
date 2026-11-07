// src/services/firebase/client.ts
// Connects to the Firebase project. Used only when EXPO_PUBLIC_BACKEND is "firebase".
import { domainError } from "@/services/domainErrors";
import type { ChunkedSecureStorage } from "@/services/session/chunkedSecureStorage";
import { firebaseConfigSchema, type FirebaseConfig } from "@/validation/configSchema";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
// @ts-ignore  (some firebase versions have a known typing gap for this export; it works at runtime)
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";

// The three Firebase objects the services use: the app, login (auth) and the
// Firestore database.
export type FirebaseClient = {
  app: FirebaseApp;
  auth: ReturnType<typeof getAuth>;
  db: Firestore;
};

type FirebaseClientDependencies = {
  // sessionStore.authStorage. The auth session holds the user's tokens, so it goes to
  // secure storage, never AsyncStorage (N-15).
  authStorage: ChunkedSecureStorage;
  // Defaults to the EXPO_PUBLIC_FIREBASE_ variables.
  config?: FirebaseConfig;
};

// EXPO_PUBLIC_ values are inlined at build time, so each variable is written out in full.
// Missing or malformed values fail with backend_not_configured: check .env.local, then
// restart with: npx expo start -c
export function firebaseConfigFromEnv(): FirebaseConfig {
  const result = firebaseConfigSchema.safeParse({
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  });
  if (!result.success) {
    throw domainError("backend_not_configured");
  }
  return result.data;
}

// Connects to the Firebase project. Only the Firebase versions of our services
// call this; screens never do.
export function createFirebaseClient({
  authStorage,
  config = firebaseConfigFromEnv(),
}: FirebaseClientDependencies): FirebaseClient {
  // Reuse the app if it already exists (fast refresh runs this again)
  const app = getApps().length > 0 ? getApp() : initializeApp(config);

  // The JS SDK needs React Native persistence set up manually,
  // or users are logged out every time the app launches.
  let auth: ReturnType<typeof getAuth>;
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(authStorage),
    });
  } catch {
    // Already initialized (fast refresh), so reuse it
    auth = getAuth(app);
  }

  // The default streaming connection can hang on React Native, so let the SDK detect
  // when it has to long-poll. Firestore persistence stays off: SQLite is our local store.
  let db: Firestore;
  try {
    db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  } catch {
    // Already initialized (fast refresh), so reuse it
    db = getFirestore(app);
  }

  return { app, auth, db };
}
