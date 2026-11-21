import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import type { GroceryRepository } from "./GroceryRepository";
import type { IngredientCatalog } from "./IngredientCatalog";
import {
  createIngredientCatalogStore,
  type IngredientCatalogStatus,
  type IngredientCatalogStore,
} from "./IngredientCatalogStore";
import { createInMemoryGroceryRepository } from "./inMemoryGroceryRepository";
import { createInMemoryIngredientRepository } from "./inMemoryIngredientRepository";
import { createInMemoryMealPlanRepository } from "./inMemoryMealPlanRepository";
import { createInMemoryProfileRepository } from "./inMemoryProfileRepository";
import { createInMemoryRecipeRepository } from "./inMemoryRecipeRepository";
import type { MealPlanRepository } from "./MealPlanRepository";
import type { ProfileRepository } from "./ProfileRepository";
import type { RecipeRepository } from "./RecipeRepository";

// Where each kind of data is stored. Screens get these through the hooks below.
export type Repositories = {
  recipes: RecipeRepository;
  mealPlans: MealPlanRepository;
  profiles: ProfileRepository;
  // The user's grocery list state: check marks and items added by hand (N-10).
  groceries: GroceryRepository;
  // Ingredient reference data for merging and converting grocery amounts (N-08): the copy
  // downloaded to this phone. Screens read it through useIngredientCatalog().
  ingredientCatalog: IngredientCatalogStore;
};

// Shares the repositories with every screen inside RepositoryProvider.
const RepositoryContext = createContext<Repositories | null>(null);

type RepositoryProviderProps = {
  children: ReactNode;
  // Pass repositories in for tests or to swap implementations.
  repositories?: Repositories;
};

// Makes the repositories available to every screen inside it. The app passes in the
// ones built at startup; if none are given, it falls back to in-memory ones.
// useState keeps the same repositories for the life of the app, instead of making new
// (empty) ones on every re-draw.
export function RepositoryProvider({ children, repositories }: RepositoryProviderProps) {
  const [value] = useState<Repositories>(() => {
    if (repositories) return repositories;
    // Read it straight away, as createAppServices does, so its status doesn't stay "loading".
    const ingredientCatalog = createIngredientCatalogStore(createInMemoryIngredientRepository());
    void ingredientCatalog.load();
    return {
      recipes: createInMemoryRecipeRepository(),
      mealPlans: createInMemoryMealPlanRepository(),
      profiles: createInMemoryProfileRepository(),
      groceries: createInMemoryGroceryRepository(),
      ingredientCatalog,
    };
  });
  return <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>;
}

// Fails loudly if a screen is used outside the provider (a setup mistake).
function useRepositories(): Repositories {
  const repositories = useContext(RepositoryContext);
  if (!repositories) {
    throw new Error("Repository hooks must be used inside RepositoryProvider");
  }
  return repositories;
}

// One hook per repository, so a screen asks only for the data it uses.
export function useRecipeRepository(): RecipeRepository {
  return useRepositories().recipes;
}

export function useMealPlanRepository(): MealPlanRepository {
  return useRepositories().mealPlans;
}

export function useProfileRepository(): ProfileRepository {
  return useRepositories().profiles;
}

export function useGroceryRepository(): GroceryRepository {
  return useRepositories().groceries;
}

// The ingredient catalog as a plain, synchronous IngredientCatalog. Re-draws the screen
// when a copy finishes loading or a new one is downloaded.
export function useIngredientCatalog(): IngredientCatalog {
  const store = useRepositories().ingredientCatalog;
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

// Whether the ingredient catalog is still loading, empty or ready (IngredientCatalogStatus).
export function useIngredientCatalogStatus(): IngredientCatalogStatus {
  const store = useRepositories().ingredientCatalog;
  return useSyncExternalStore(store.subscribe, store.getStatus);
}

// When the ingredient data on this phone was downloaded, or null if there is none.
export function useIngredientDataUpdatedAt(): number | null {
  const store = useRepositories().ingredientCatalog;
  return useSyncExternalStore(store.subscribe, store.getUpdatedAt);
}
