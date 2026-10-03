// src/services/firebase/client.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
// @ts-ignore  (some firebase versions have a known typing gap for this export; it works at runtime)
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Fail fast with a clear message if .env.local is missing or wasn't loaded
const missing = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);
if (missing.length > 0) {
  throw new Error(
    `Missing Firebase config: ${missing.join(", ")}. ` +
      `Check .env.local, then restart with: npx expo start -c`
  );
}

// Reuse the app if it already exists (fast refresh runs this file again)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// The JS SDK needs React Native persistence set up manually,
// or users are logged out every time the app launches.
let auth: ReturnType<typeof getAuth>;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // Already initialized (fast refresh), so reuse it
  auth = getAuth(app);
}

const db = getFirestore(app);

export { app, auth, db };
