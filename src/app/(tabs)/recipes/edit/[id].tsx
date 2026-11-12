// Edit a saved recipe (N-01): change any field the New Recipe form has, then save.
// The change is saved on this phone first (offline-first) and synced later.
import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { RecipeForm } from "@/features/recipes/components/RecipeForm";
import {
  RECIPE_SAVE_FAILED_MESSAGE,
  recipeUpdateFailure,
  toRecipeForm,
  type RecipeFormSubmitResult,
} from "@/features/recipes/recipeForm";
import type { Recipe, RecipeData, RecipeUpdateResult } from "@/repositories/RecipeRepository";
import { useRecipeRepository } from "@/repositories/RepositoryProvider";
import { recipeIdSchema } from "@/validation/recipeSchema";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";

// Shown when the recipe doesn't exist, e.g. it was deleted or the link was wrong.
const NOT_FOUND = (
  <PlaceholderScreen title="Recipe not found" description="This recipe is no longer available." />
);

// Shown if the recipe couldn't be read from the phone's storage.
const LOAD_FAILED = (
  <PlaceholderScreen title="Couldn't open this recipe" description="Please go back and try again." />
);

// This screen is split into three parts:
// 1. EditRecipeScreen checks the recipe's ID from the link that opened the screen.
// 2. RecipeLoader looks the recipe up, once.
// 3. RecipeEditor shows the recipe form, filled in with the saved recipe.
export default function EditRecipeScreen() {
  // Route params are user-controllable (deep links), so validate before use.
  const { id } = useLocalSearchParams();
  const parsed = recipeIdSchema.safeParse(id);
  if (!parsed.success) return NOT_FOUND;
  return <RecipeLoader id={parsed.data} />;
}

function RecipeLoader({ id }: { id: string }) {
  const recipes = useRecipeRepository();
  // undefined = still loading, null = not found (or deleted), "failed" = couldn't be read
  const [recipe, setRecipe] = useState<Recipe | null | "failed" | undefined>(undefined);

  // Look the recipe up when the screen opens. If the screen closes before the answer
  // comes back, "active" is false and the answer is ignored.
  // This doesn't listen for later changes: reloading the form while the user is typing
  // (e.g. after a background sync) would wipe their edits. If a sync changes the recipe
  // meanwhile, the last edit wins when it is saved.
  useEffect(() => {
    let active = true;
    recipes.getById(id).then(
      (found) => {
        if (active) setRecipe(found ?? null);
      },
      () => {
        if (active) setRecipe("failed");
      },
    );
    return () => {
      active = false;
    };
  }, [recipes, id]);

  // Show nothing while loading, so the "not found" message doesn't flash up first.
  if (recipe === undefined) return null;
  if (recipe === null) return NOT_FOUND;
  if (recipe === "failed") return LOAD_FAILED;
  return <RecipeEditor recipe={recipe} />;
}

function RecipeEditor({ recipe }: { recipe: Recipe }) {
  const router = useRouter();
  const recipes = useRecipeRepository();
  // The saved recipe as form values, made once when the screen opens.
  const [initialValues] = useState(() => toRecipeForm(recipe));

  // Called by the form with the cleaned recipe. The repository validates it again,
  // replaces the recipe's fields, sets a new updatedAt and marks it for sync.
  // On success, close this screen and go back to the recipe list.
  async function handleSubmit(data: RecipeData): Promise<RecipeFormSubmitResult> {
    let result: RecipeUpdateResult;
    try {
      result = await recipes.update(recipe.id, data);
    } catch {
      // e.g. storage_failed. Never show or log the error itself.
      return { ok: false, message: RECIPE_SAVE_FAILED_MESSAGE };
    }
    if (!result.ok) {
      return recipeUpdateFailure(result);
    }
    router.back();
    return { ok: true };
  }

  return (
    <RecipeForm
      initialValues={initialValues}
      submitLabel="Save changes"
      busyLabel="Saving…"
      disableUntilChanged
      onSubmit={handleSubmit}
    />
  );
}
