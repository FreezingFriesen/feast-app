// src/validation/profileSchema.ts
// User profile (N-18, #19): username and dietary restrictions.
import { z } from "zod";
import { storedUsernameSchema, timestampSchema } from "./authSchema";
import { ALLERGENS, DIET_TAGS } from "./recipeSchema";

// Limits. Mirror these in the Firestore Security Rules for users/{uid}.
export const PROFILE_SCHEMA_VERSION = 1;
export const MAX_ALLERGENS = ALLERGENS.length;
export const MAX_DIETS = DIET_TAGS.length;

// Removes duplicates and sorts into vocabulary order, so the same choices are
// always stored the same way.
function inVocabularyOrder<T extends string>(vocabulary: readonly T[]) {
  return (values: T[]): T[] => vocabulary.filter((value) => values.includes(value));
}

// Empty lists mean the user chose "none". "Not set yet" is a null dietaryRestrictions
// on the profile, not an empty object.
export const dietaryRestrictionsSchema = z.object({
  allergens: z.array(z.enum(ALLERGENS)).max(MAX_ALLERGENS).transform(inVocabularyOrder(ALLERGENS)),
  diets: z.array(z.enum(DIET_TAGS)).max(MAX_DIETS).transform(inVocabularyOrder(DIET_TAGS)),
});

// A profile coming from outside the device: sign up, restore on a new device, sync downloads.
// The uid is not part of the data; it comes from the auth session.
export const storedProfileSchema = z
  .object({
    username: storedUsernameSchema,
    dietaryRestrictions: dietaryRestrictionsSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    schemaVersion: z.literal(PROFILE_SCHEMA_VERSION),
  })
  .refine((profile) => profile.updatedAt >= profile.createdAt, {
    path: ["updatedAt"],
    message: "updatedAt is before createdAt",
  });
