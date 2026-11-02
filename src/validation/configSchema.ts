// src/validation/configSchema.ts
// Build-time configuration read from EXPO_PUBLIC_ variables (never secrets).
import { z } from "zod";
import { FIREBASE_CONFIG_VALUE_PATTERN } from "./patterns";

// Which backend the app talks to. "memory" is a development fake.
export const BACKENDS = ["memory", "firebase"] as const;
export type Backend = (typeof BACKENDS)[number];
export const backendSchema = z.enum(BACKENDS);

// The Firebase web config. These values identify the Firebase project; they are not
// secrets (the Security Rules control access).
const firebaseConfigValue = z.string().max(200).regex(FIREBASE_CONFIG_VALUE_PATTERN);

export const firebaseConfigSchema = z.object({
  apiKey: firebaseConfigValue,
  authDomain: firebaseConfigValue,
  projectId: firebaseConfigValue,
  storageBucket: firebaseConfigValue,
  messagingSenderId: firebaseConfigValue,
  appId: firebaseConfigValue,
});
export type FirebaseConfig = z.output<typeof firebaseConfigSchema>;
