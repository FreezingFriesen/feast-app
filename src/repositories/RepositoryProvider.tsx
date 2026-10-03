import { createContext, useContext, useState, type ReactNode } from "react";
import { createInMemoryRecipeRepository } from "./inMemoryRecipeRepository";
import type { RecipeRepository } from "./RecipeRepository";

export type Repositories = {
  recipes: RecipeRepository;
};

const RepositoryContext = createContext<Repositories | null>(null);

type RepositoryProviderProps = {
  children: ReactNode;
  // Pass repositories in for tests or to swap implementations.
  repositories?: Repositories;
};

export function RepositoryProvider({ children, repositories }: RepositoryProviderProps) {
  const [value] = useState<Repositories>(
    () => repositories ?? { recipes: createInMemoryRecipeRepository() },
  );
  return <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>;
}

export function useRecipeRepository(): RecipeRepository {
  const repositories = useContext(RepositoryContext);
  if (!repositories) {
    throw new Error("useRecipeRepository must be used inside RepositoryProvider");
  }
  return repositories.recipes;
}
