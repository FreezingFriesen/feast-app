import type { Recipe } from "@/repositories/RecipeRepository";
import { useRecipeRepository } from "@/repositories/RepositoryProvider";
import { useEffect, useState } from "react";

// loading: the first read hasn't finished. missing: no such recipe, or it was deleted.
// failed: the phone's storage couldn't be read.
export type RecipeState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "failed" }
  | { status: "ready"; recipe: Recipe };

// One saved recipe, read again after every change to the recipes, so the detail screen
// shows an edit (or a sync) as soon as it's saved, and "not found" once it's deleted.
// `id` must already be validated (recipeIdSchema).
export function useRecipe(id: string): RecipeState {
  const repository = useRecipeRepository();
  const [state, setState] = useState<{ id: string; value: RecipeState } | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      repository.getById(id).then(
        (recipe) => {
          if (active) setState({ id, value: recipe ? { status: "ready", recipe } : { status: "missing" } });
        },
        () => {
          if (active) setState({ id, value: { status: "failed" } });
        },
      );
    };
    load();
    const unsubscribe = repository.subscribe(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository, id]);

  // A result for another ID (the link changed) counts as still loading.
  return state?.id === id ? state.value : { status: "loading" };
}
