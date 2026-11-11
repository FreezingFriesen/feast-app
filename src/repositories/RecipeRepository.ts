import type { z } from "zod";
import type { recipeSchema, storedRecipeSchema } from "@/validation/recipeSchema";
import type { Syncable } from "./Syncable";

// The cleaned, validated recipe fields (output of recipeSchema).
export type RecipeData = z.output<typeof recipeSchema>;

// A recipe as stored and synced (output of storedRecipeSchema): the recipe fields plus
// the repository's fields, without the ID (that is the document ID).
export type StoredRecipe = z.output<typeof storedRecipeSchema>;

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

// What update() returns: the saved recipe, or why it wasn't saved.
export type RecipeUpdateResult =
  | { ok: true; recipe: Recipe }
  | { ok: false; reason: "invalid"; error: z.ZodError }
  | { ok: false; reason: "not_found" };

// Screens depend on this interface only. Implementations (in-memory and SQLite) are
// swapped in through RepositoryProvider. Every local write marks the recipe for upload.
export type RecipeRepository = {
  // Validates the input with recipeSchema before writing.
  create(input: unknown): Promise<CreateRecipeResult>;
  // Replaces the recipe's fields. Validates the input with recipeSchema and sets a new
  // updatedAt; id, createdAt and schemaVersion never change.
  update(id: string, input: unknown): Promise<RecipeUpdateResult>;
  // Soft delete (sets deletedAt). Returns false if the recipe was not found or was
  // already deleted. A deleted recipe stays deleted.
  remove(id: string): Promise<boolean>;
  // Returns recipes that are not soft-deleted, newest first.
  list(): Promise<Recipe[]>;
  // One recipe, or undefined if it doesn't exist or was deleted.
  getById(id: string): Promise<Recipe | undefined>;
  // Removes every recipe from this device (logout wipe, account deletion).
  clear(): Promise<void>;
  // Calls the listener after every change. Returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
} & Syncable<StoredRecipe>;
