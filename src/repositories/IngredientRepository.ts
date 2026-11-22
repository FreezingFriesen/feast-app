import type { Ingredient } from "@/validation/ingredientSchema";

// The most ingredients the phone keeps, and so the most one download may bring (N-08).
// Edwin's data has 200; this leaves room to grow without letting a bad download fill
// the phone.
export const MAX_INGREDIENTS = 2000;

// The longest stored JSON text for one ingredient. A valid ingredient is well under this;
// longer text (a tampered database) is never parsed.
export const MAX_INGREDIENT_JSON_LENGTH = 8000;

// When the copy on the phone was downloaded (the phone's clock) and how many it holds.
export type IngredientCacheMeta = { fetchedAt: number; count: number };

// The phone's copy of the shared ingredient data (ingredients/{id} in Firestore). Shared
// reference data, not the user's own: it isn't synced back, and log out and account
// deletion leave it in place. Every write and every read is validated with
// storedIngredientSchema; a stored row that fails reads as missing.
export type IngredientRepository = {
  // Replaces the whole copy, or changes nothing: refuses (DomainError "invalid_input") an
  // empty list, more than MAX_INGREDIENTS, duplicate IDs, an invalid ingredient or an
  // invalid fetchedAt, and leaves the old copy if storage fails part way.
  replaceAll(ingredients: readonly Ingredient[], fetchedAt: number): Promise<void>;
  // The current copy, by ID, cleaned by the schema. Empty if there is none.
  list(): Promise<Ingredient[]>;
  // When the current copy was downloaded and how big it is, or null if there is none.
  meta(): Promise<IngredientCacheMeta | null>;
  // Removes the copy. Not part of log out (see LocalDataWiper).
  clear(): Promise<void>;
  // Called after every replaceAll or clear. Returns a function that stops listening.
  subscribe(listener: () => void): () => void;
};
