import { createContext, useContext, useState, type ReactNode } from "react";
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
  const [value] = useState<Repositories>(
    () =>
      repositories ?? {
        recipes: createInMemoryRecipeRepository(),
        mealPlans: createInMemoryMealPlanRepository(),
        profiles: createInMemoryProfileRepository(),
      },
  );
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
