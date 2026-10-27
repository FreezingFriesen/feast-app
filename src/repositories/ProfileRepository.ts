import type { z } from "zod";
import type { dietaryRestrictionsSchema, storedProfileSchema } from "@/validation/profileSchema";

// The cleaned, validated restrictions (output of dietaryRestrictionsSchema).
// Empty lists mean the user chose "none".
export type DietaryRestrictions = z.output<typeof dietaryRestrictionsSchema>;

// Profile fields as stored and synced (output of storedProfileSchema).
// dietaryRestrictions is null until the user sets it ("not set yet").
export type StoredProfile = z.output<typeof storedProfileSchema>;

// The uid always comes from the auth session, never from route params.
export type Profile = StoredProfile & { uid: string };

export type ProfileWriteResult =
  | { ok: true; profile: Profile }
  | { ok: false; reason: "invalid"; error: z.ZodError }
  | { ok: false; reason: "not_found" };

// applied: the incoming copy was newer and replaced the local one.
// kept_local: the local copy was as new or newer (last edit wins).
// invalid: the incoming data failed validation and nothing was stored.
export type ProfileMergeResult = "applied" | "kept_local" | "invalid";

// Screens depend on this interface only. Implementations (in-memory now,
// SQLite + Firestore sync later) are swapped in through RepositoryProvider.
export type ProfileRepository = {
  get(uid: string): Promise<Profile | undefined>;
  // Validates the input with dietaryRestrictionsSchema, writes locally first and
  // bumps updatedAt so sync uploads it later.
  setDietaryRestrictions(uid: string, input: unknown): Promise<ProfileWriteResult>;
  // Profile data from outside the device: sign up, restore on a new device, sync downloads.
  // Validated with storedProfileSchema and kept only if newer than the local copy.
  mergeIncoming(uid: string, data: unknown): Promise<ProfileMergeResult>;
  // Removes every cached profile (logout wipe, account deletion).
  clear(): Promise<void>;
  // Calls the listener after every change. Returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
};
