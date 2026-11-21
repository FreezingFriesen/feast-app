import type { Ingredient } from "@/validation/ingredientSchema";
import { ingredientData, prepareReplacement, readStoredIngredient } from "./ingredientRecords";
import type { IngredientRepository } from "./IngredientRepository";

// The current copy: each ingredient's stored JSON by ID, when it was downloaded, and its size.
type Copy = { data: ReadonlyMap<string, string>; fetchedAt: number; count: number };

// The ingredient catalog's copy kept in memory: it lasts only while the app is open. Used
// by tests and by RepositoryProvider when no repositories are passed in; the app uses the
// SQLite version. Both pass the same contract tests. Data is kept as JSON text and checked
// again on every read, like the SQLite version, so callers always get fresh copies.
export function createInMemoryIngredientRepository(): IngredientRepository {
  let copy: Copy | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  return {
    async replaceAll(ingredients, fetchedAt) {
      const { rows, fetchedAt: time } = prepareReplacement(ingredients, fetchedAt);
      // Built in full, then swapped in by one assignment.
      copy = { data: new Map(rows.map((row) => [row.id, ingredientData(row)])), fetchedAt: time, count: rows.length };
      notify();
    },

    async list() {
      if (copy === null) return [];
      return [...copy.data]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .flatMap(([id, data]): Ingredient[] => {
          const ingredient = readStoredIngredient(id, data);
          return ingredient ? [ingredient] : [];
        });
    },

    async meta() {
      return copy === null ? null : { fetchedAt: copy.fetchedAt, count: copy.count };
    },

    async clear() {
      copy = null;
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
