import type { z } from "zod";
import type { recipeSchema } from "@/validation/recipeSchema";

// The cleaned, validated recipe fields (output of recipeSchema).
export type RecipeData = z.output<typeof recipeSchema>;

export type Recipe = RecipeData & {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  schemaVersion: number;
};

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
  getById(id: string): Promise<Recipe | undefined>;
  // Removes every recipe from this device (logout wipe, account deletion).
  clear(): Promise<void>;
  // Calls the listener after every change. Returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
};
