import { ID_PATTERN } from "@/validation/patterns";
import { recipeSchema } from "@/validation/recipeSchema";
import { newId } from "./newId";
import type { Recipe, RecipeRepository } from "./RecipeRepository";

// The version of the recipe format. Raise it if the fields change.
const SCHEMA_VERSION = 1;

// Temporary store for Sprint 1: recipes live only while the app is open.
// Replace with a SQLite implementation of RecipeRepository for #1.
// "now" is the clock, so tests can control the timestamps.
export function createInMemoryRecipeRepository(
  now: () => number = Date.now,
): RecipeRepository {
  // Every recipe by ID, including deleted ones (they keep their deletedAt).
  const recipes = new Map<string, Recipe>();
  // The screens to tell when something changes (see subscribe below).
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((listener) => listener());

  return {
    async create(input) {
      // The repository check is the one that counts: validate before every write.
      const result = recipeSchema.safeParse(input);
      if (!result.success) {
        return { ok: false, error: result.error };
      }

      // A safety check: IDs end up in database paths, so never store one that breaks the ID rule.
      const id = newId();
      if (!ID_PATTERN.test(id)) {
        throw new Error("Generated recipe ID is invalid");
      }

      // Save the cleaned data (result.data), plus the fields the repository sets.
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

    // Leaves out deleted recipes; the most recently changed come first.
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

    async clear() {
      recipes.clear();
      notify();
    },

    // Screens call this to hear about changes. The function it returns stops listening.
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
