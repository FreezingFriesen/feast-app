import type { Recipe } from "@/repositories/RecipeRepository";
import { useRecipeRepository } from "@/repositories/RepositoryProvider";
import { useEffect, useState } from "react";

// All recipes (newest first) plus whether they have loaded yet. `recipes` starts as [],
// so a screen that must not show "no recipes" too early waits for `loaded`.
export function useRecipesState(): { recipes: Recipe[]; loaded: boolean } {
  const repository = useRecipeRepository();
  const [state, setState] = useState<{ loaded: boolean; recipes: Recipe[] }>({ loaded: false, recipes: [] });

  // Load the list of recipes on mount and subscribe to changes in the repository.
  useEffect(() => {
    let active = true;
    const load = () => {
      repository.list().then((list) => {
        if (active) setState({ loaded: true, recipes: list });
      });
    };
    load();
    const unsubscribe = repository.subscribe(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository]);

  return state;
}

// All recipes (newest first), reloaded after every change.
export function useRecipes(): Recipe[] {
  return useRecipesState().recipes;
}

// Recipes keyed by ID, for code that looks recipes up (the planner, the grocery list).
export function recipesById(recipes: readonly Recipe[]): ReadonlyMap<string, Recipe> {
  return new Map(recipes.map((recipe) => [recipe.id, recipe]));
}

// The same recipes keyed by ID, for screens that look recipes up (e.g. the meal planner).
export function useRecipesById(): ReadonlyMap<string, Recipe> {
  return recipesById(useRecipes());
}
