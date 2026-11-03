import type { z } from "zod";
import type { recipeSchema } from "@/validation/recipeSchema";

// The cleaned, validated recipe fields (output of recipeSchema).
export type RecipeData = z.output<typeof recipeSchema>;

// A saved recipe. The extra fields are set by the repository, never by the user.
// Timestamps are in milliseconds; deletedAt is only set once it is deleted (soft delete).
export type Recipe = RecipeData & {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  schemaVersion: number;
};

// What create() returns: the saved recipe, or the validation errors.
export type CreateRecipeResult =
  | { ok: true; recipe: Recipe }
  | { ok: false; error: z.ZodError };

// Screens depend on this interface only. Implementations (in-memory now,
// SQLite + Firestore sync later) are swapped in through RepositoryProvider.
export type RecipeRepository = {
  // Validates the input with recipeSchema before writing.
  create(input: unknown): Promise<CreateRecipeResult>;
  // Returns recipes that are not soft-deleted, newest first.
  list(): Promise<Recipe[]>;
  // One recipe, or undefined if it doesn't exist or was deleted.
  getById(id: string): Promise<Recipe | undefined>;
  // Removes every recipe from this device (logout wipe, account deletion).
  clear(): Promise<void>;
  // Calls the listener after every change. Returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
};
