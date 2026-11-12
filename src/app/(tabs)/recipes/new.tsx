// This screen allows the user to create a new recipe by filling out a form with various fields
// such as title, description, ingredients, steps, and diet tags.
// The form (RecipeForm) validates before submission and displays any errors (N-01).
import { RecipeForm } from "@/features/recipes/components/RecipeForm";
import { emptyRecipeForm, type RecipeFormSubmitResult } from "@/features/recipes/recipeForm";
import type { RecipeData } from "@/repositories/RecipeRepository";
import { useRecipeRepository } from "@/repositories/RepositoryProvider";
import { useRouter } from "expo-router";
import { useState } from "react";

// The NewRecipeScreen component shows an empty recipe form and saves the new recipe to
// the repository when the user presses save.
export default function NewRecipeScreen() {
  const router = useRouter();
  // Where recipes are saved. The screen never talks to the database directly.
  const recipes = useRecipeRepository();
  // An empty form, made once when the screen opens.
  const [initialValues] = useState(emptyRecipeForm);

  // Called by the form with the cleaned recipe (it has already passed the form's check).
  // The repository validates again before writing. On success, go back to the recipe list.
  async function handleSubmit(recipe: RecipeData): Promise<RecipeFormSubmitResult> {
    const result = await recipes.create(recipe);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    router.back();
    return { ok: true };
  }

  return (
    <RecipeForm
      initialValues={initialValues}
      submitLabel="Save recipe"
      busyLabel="Saving…"
      onSubmit={handleSubmit}
    />
  );
}
