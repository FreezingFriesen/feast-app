import type { Recipe } from "@/repositories/RecipeRepository";
import { useRecipeRepository } from "@/repositories/RepositoryProvider";
import { useEffect, useState } from "react";

// All recipes (newest first), reloaded after every change.
export function useRecipes(): Recipe[] {
  const repository = useRecipeRepository();
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  // Load the list of recipes on mount and subscribe to changes in the repository.
  useEffect(() => {
    let active = true;
    const load = () => {
      repository.list().then((list) => {
        if (active) setRecipes(list);
      });
    };
    load();
    const unsubscribe = repository.subscribe(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository]);

  return recipes;
}

// The same recipes keyed by ID, for screens that look recipes up (e.g. the meal planner).
export function useRecipesById(): ReadonlyMap<string, Recipe> {
  const recipes = useRecipes();
  return new Map(recipes.map((recipe) => [recipe.id, recipe]));
}
