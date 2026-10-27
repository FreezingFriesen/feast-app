import { createContext, useContext, useState, type ReactNode } from "react";
import { createInMemoryMealPlanRepository } from "./inMemoryMealPlanRepository";
import { createInMemoryProfileRepository } from "./inMemoryProfileRepository";
import { createInMemoryRecipeRepository } from "./inMemoryRecipeRepository";
import type { MealPlanRepository } from "./MealPlanRepository";
import type { ProfileRepository } from "./ProfileRepository";
import type { RecipeRepository } from "./RecipeRepository";

export type Repositories = {
  recipes: RecipeRepository;
  mealPlans: MealPlanRepository;
  profiles: ProfileRepository;
};

const RepositoryContext = createContext<Repositories | null>(null);

type RepositoryProviderProps = {
  children: ReactNode;
  // Pass repositories in for tests or to swap implementations.
  repositories?: Repositories;
};

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

function useRepositories(): Repositories {
  const repositories = useContext(RepositoryContext);
  if (!repositories) {
    throw new Error("Repository hooks must be used inside RepositoryProvider");
  }
  return repositories;
}

export function useRecipeRepository(): RecipeRepository {
  return useRepositories().recipes;
}

export function useMealPlanRepository(): MealPlanRepository {
  return useRepositories().mealPlans;
}

export function useProfileRepository(): ProfileRepository {
  return useRepositories().profiles;
}
