// src/validation/configSchema.ts
// Build-time configuration read from EXPO_PUBLIC_ variables (never secrets).
import { z } from "zod";

// Which backend the app talks to. "memory" is a development fake.
export const BACKENDS = ["memory", "firebase"] as const;
export type Backend = (typeof BACKENDS)[number];
export const backendSchema = z.enum(BACKENDS);
