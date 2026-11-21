// What the app holds for the ingredient catalog (N-08): the copy on the phone, turned into
// an IngredientCatalog the screens can ask synchronously during a render. Loads from the
// local database only (offline and signed out included) and reloads whenever the copy is
// replaced. useIngredientCatalog() reads it with useSyncExternalStore, so the grocery list
// re-renders when the catalog arrives.
import { emptyIngredientCatalog, type IngredientCatalog } from "./IngredientCatalog";
import { buildIngredientCatalog } from "./ingredientCatalogIndex";
import type { IngredientRepository } from "./IngredientRepository";

export type IngredientCatalogStore = {
  // The current catalog. The same object until the data changes, then a new frozen one
  // (what useSyncExternalStore needs). Empty until the first load finishes.
  getSnapshot(): IngredientCatalog;
  // When the copy shown was downloaded, or null if there is none (the Account page says
  // "Ingredient data: updated …").
  getUpdatedAt(): number | null;
  // Called after every load. Returns a function that stops listening.
  subscribe(listener: () => void): () => void;
  // Reads the copy from the phone. Never rejects: if it can't be read, the catalog the app
  // already has stays (empty at first, which is how the app behaved before the catalog).
  load(): Promise<void>;
};

export function createIngredientCatalogStore(
  repository: Pick<IngredientRepository, "list" | "meta" | "subscribe">,
): IngredientCatalogStore {
  let snapshot: IngredientCatalog = emptyIngredientCatalog;
  let updatedAt: number | null = null;
  // Each load gets a number; only the latest one started may change the snapshot, so a
  // slow read of an older copy can't replace a newer one.
  let latestLoad = 0;
  const listeners = new Set<() => void>();

  async function load() {
    latestLoad += 1;
    const thisLoad = latestLoad;
    try {
      const [ingredients, meta] = await Promise.all([repository.list(), repository.meta()]);
      if (thisLoad !== latestLoad) return;
      snapshot = buildIngredientCatalog(ingredients);
      updatedAt = ingredients.length > 0 ? (meta?.fetchedAt ?? null) : null;
      listeners.forEach((listener) => listener());
    } catch {
      // Nothing is lost: the copy stays in the database for the next load.
    }
  }

  // A new copy (or a cleared one) is loaded straight away. Lives as long as the store.
  repository.subscribe(() => void load());

  return {
    getSnapshot: () => snapshot,
    getUpdatedAt: () => updatedAt,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
  };
}
