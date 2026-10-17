import { ID_PATTERN } from "@/validation/patterns";
import { recipeSchema } from "@/validation/recipeSchema";
import { newId } from "./newId";
import type { Recipe, RecipeRepository } from "./RecipeRepository";

const SCHEMA_VERSION = 1;

// Temporary store for Sprint 1: recipes live only while the app is open.
// Replace with a SQLite implementation of RecipeRepository for #1.
export function createInMemoryRecipeRepository(
  now: () => number = Date.now,
): RecipeRepository {
  const recipes = new Map<string, Recipe>();
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((listener) => listener());

  return {
    async create(input) {
      // The repository check is the one that counts: validate before every write.
      const result = recipeSchema.safeParse(input);
      if (!result.success) {
        return { ok: false, error: result.error };
      }

      const id = newId();
      if (!ID_PATTERN.test(id)) {
        throw new Error("Generated recipe ID is invalid");
      }

      const timestamp = now();
      const recipe: Recipe = {
        ...result.data,
        id,
        createdAt: timestamp,
        updatedAt: timestamp,
        schemaVersion: SCHEMA_VERSION,
      };
      recipes.set(id, recipe);
      notify();
      return { ok: true, recipe };
    },

    async list() {
      return [...recipes.values()]
        .filter((recipe) => recipe.deletedAt === undefined)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async getById(id) {
      if (!ID_PATTERN.test(id)) return undefined;
      const recipe = recipes.get(id);
      return recipe?.deletedAt === undefined ? recipe : undefined;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
