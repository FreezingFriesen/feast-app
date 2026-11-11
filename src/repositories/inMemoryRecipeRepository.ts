import { RECIPE_SCHEMA_VERSION, recipeSchema, storedRecipeSchema } from "@/validation/recipeSchema";
import type { Recipe, RecipeRepository, StoredRecipe } from "./RecipeRepository";
import { incomingWins, isRecordId, isTimestamp, newRecordId, nextUpdatedAt, withoutUndefined } from "./records";
import { isPendingLimit } from "./Syncable";

// Recipes kept in memory: they last only while the app is open. Used by tests and by
// RepositoryProvider when no repositories are passed in; the app uses the SQLite version.
// Both pass the same contract tests, so they behave the same.
// "now" is the clock, so tests can control the timestamps.
export function createInMemoryRecipeRepository(
  now: () => number = Date.now,
): RecipeRepository {
  // Every recipe by ID, including deleted ones (they keep their deletedAt).
  const recipes = new Map<string, StoredRecipe>();
  // IDs of recipes changed on this "device" and not uploaded yet.
  const pending = new Set<string>();
  // The screens to tell when something changes (see subscribe below).
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((listener) => listener());

  const toRecipe = (id: string, data: StoredRecipe): Recipe => ({ ...data, id });

  // The recipe with this ID, unless it's missing, deleted, or the ID isn't a valid one.
  const findLive = (id: string) => {
    if (!isRecordId(id)) return undefined;
    const data = recipes.get(id);
    return data?.deletedAt === undefined ? data : undefined;
  };

  // Stores a local change and marks it for upload.
  const saveLocal = (id: string, data: StoredRecipe) => {
    const saved = withoutUndefined(data);
    recipes.set(id, saved);
    pending.add(id);
    notify();
    return toRecipe(id, saved);
  };

  return {
    async create(input) {
      // The repository check is the one that counts: validate before every write.
      const result = recipeSchema.safeParse(input);
      if (!result.success) {
        return { ok: false, error: result.error };
      }

      // Save the cleaned data (result.data), plus the fields the repository sets.
      // The whole record is checked too (e.g. a phone clock set before 2020).
      const timestamp = now();
      const stored = storedRecipeSchema.safeParse({
        ...result.data,
        createdAt: timestamp,
        updatedAt: timestamp,
        schemaVersion: RECIPE_SCHEMA_VERSION,
      });
      if (!stored.success) {
        return { ok: false, error: stored.error };
      }
      return { ok: true, recipe: saveLocal(newRecordId("recipe"), stored.data) };
    },

    async update(id, input) {
      const existing = findLive(id);
      if (!existing) {
        return { ok: false, reason: "not_found" };
      }
      const result = recipeSchema.safeParse(input);
      if (!result.success) {
        return { ok: false, reason: "invalid", error: result.error };
      }

      // A new updatedAt, so this edit wins over older copies when syncing.
      const stored = storedRecipeSchema.safeParse({
        ...result.data,
        createdAt: existing.createdAt,
        updatedAt: nextUpdatedAt(now, existing.updatedAt),
        schemaVersion: existing.schemaVersion,
      });
      if (!stored.success) {
        return { ok: false, reason: "invalid", error: stored.error };
      }
      return { ok: true, recipe: saveLocal(id, stored.data) };
    },

    async remove(id) {
      const existing = findLive(id);
      if (!existing) return false;

      // Soft delete, so a later sync cannot bring the recipe back.
      const timestamp = nextUpdatedAt(now, existing.updatedAt);
      const stored = storedRecipeSchema.safeParse({ ...existing, deletedAt: timestamp, updatedAt: timestamp });
      if (!stored.success) return false;
      saveLocal(id, stored.data);
      return true;
    },

    // Leaves out deleted recipes; the most recently changed come first.
    async list() {
      return [...recipes]
        .filter(([, data]) => data.deletedAt === undefined)
        .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
        .map(([id, data]) => toRecipe(id, data));
    },

    async getById(id) {
      const data = findLive(id);
      return data ? toRecipe(id, data) : undefined;
    },

    async listPending(limit) {
      if (!isPendingLimit(limit)) return [];
      return [...recipes]
        .filter(([id]) => pending.has(id))
        .sort(([, a], [, b]) => a.updatedAt - b.updatedAt)
        .slice(0, limit)
        .map(([id, data]) => ({ id, data }));
    },

    async pendingCount() {
      return pending.size;
    },

    async markSynced(id, updatedAt) {
      if (!isRecordId(id) || !isTimestamp(updatedAt)) return false;
      // Only if nothing changed since the upload started.
      if (!pending.has(id) || recipes.get(id)?.updatedAt !== updatedAt) return false;
      pending.delete(id);
      return true;
    },

    async mergeIncoming(id, data) {
      if (!isRecordId(id)) return "invalid";
      const result = storedRecipeSchema.safeParse(data);
      if (!result.success) return "invalid";

      const existing = recipes.get(id);
      if (existing && !incomingWins(existing, result.data)) {
        return "kept_local";
      }
      // It came from the server, so there is nothing to upload.
      recipes.set(id, withoutUndefined(result.data));
      pending.delete(id);
      notify();
      return "applied";
    },

    async clear() {
      recipes.clear();
      pending.clear();
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
