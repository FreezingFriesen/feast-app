// Shared by the recipe filter's end-to-end checks (#10, N-04): the memory backend through
// createAppServices (npm test) and the Firebase emulators (npm run test:backend). These
// stand in for Phase 2's hand check in code; they don't replace a person checking a phone.
//
// The recipes use only names that match exactly one ingredient in the sample data
// (SAMPLE_INGREDIENTS / ingredients-catalog.csv), even when another emulator test has also
// imported ingredients-small.csv (which makes "Flour", "Eggs" and "Yellow onion" shared,
// and so unmatched). "Hoisin sauce" matches nothing anywhere.
import { createAssessmentMemo } from "@/features/recipes/filter/assessmentMemo";
import type { ProfileFilterSource } from "@/features/recipes/filter/recipeFilter";
import { deriveRecipeListState, type RecipeListState } from "@/features/recipes/filter/recipeListState";
import type { IngredientCatalogStore } from "@/repositories/IngredientCatalogStore";
import type { ProfileRepository } from "@/repositories/ProfileRepository";
import type { RecipeRepository } from "@/repositories/RecipeRepository";
import { DEFAULT_RECIPE_FILTER, type RecipeFilter } from "@/validation/recipeFilterSchema";

const recipe = (title: string, names: string[], extra: Record<string, unknown> = {}) => ({
  title,
  servings: 2,
  ingredients: names.map((name) => ({ name, quantity: 1, unit: "piece" })),
  steps: ["Make it."],
  ...extra,
});

// What each one is for, with a milk allergy:
// - Latte: a matched, unreviewed ingredient that lists milk.
// - Omelette, Peanut butter toast: every row matched a reviewed ingredient; no milk.
// - Rice bowl: every row matched, none reviewed; no milk listed.
// - Stir fry: one row matches nothing ("Hoisin sauce").
// - Vegan pancakes: tagged vegan, but contains milk.
export const HAND_CHECK_RECIPES = Object.freeze([
  recipe("Latte", ["Whole milk"]),
  recipe("Omelette", ["Large egg"]),
  recipe("Rice bowl", ["White rice", "Canola oil"]),
  recipe("Stir fry", ["Soy sauce", "Hoisin sauce"]),
  recipe("Peanut butter toast", ["Peanut butter"]),
  recipe("Vegan pancakes", ["Whole milk", "White sugar"], { dietTags: ["vegan"] }),
]);

export async function saveHandCheckRecipes(recipes: Pick<RecipeRepository, "create">): Promise<void> {
  for (const input of HAND_CHECK_RECIPES) {
    const result = await recipes.create(input);
    if (!result.ok) throw new Error(`Couldn't save ${input.title}`);
  }
}

// The parts of a phone the Recipes tab reads.
export type FilterPhone = {
  recipes: Pick<RecipeRepository, "list">;
  profiles: Pick<ProfileRepository, "get">;
  catalog: Pick<IngredientCatalogStore, "getSnapshot" | "getStatus">;
};

// What the Recipes tab would show, worked out from the phone's own data the way
// useFilteredRecipes does. Sorted A–Z here, so the order doesn't depend on timestamps.
export async function recipeListStateOn(
  phone: FilterPhone,
  uid: string | null,
  { profileFilterOn = true, filters = { ...DEFAULT_RECIPE_FILTER, sort: "title" } }: { profileFilterOn?: boolean; filters?: RecipeFilter } = {},
): Promise<RecipeListState> {
  const [recipes, profile] = await Promise.all([phone.recipes.list(), uid === null ? undefined : phone.profiles.get(uid)]);
  const source: ProfileFilterSource =
    profile !== undefined
      ? { status: "ready", restrictions: profile.dietaryRestrictions }
      : { status: uid === null ? "signed_out" : "unavailable" };
  const catalog = phone.catalog.getSnapshot();
  return deriveRecipeListState({
    recipesLoaded: true,
    recipes,
    profile: source,
    profileFilterOn,
    filters,
    catalogStatus: phone.catalog.getStatus(),
    assess: createAssessmentMemo().forCatalog(catalog, recipes),
  });
}

// The ready state, failing the check if the list would still show a spinner.
export function readyList(state: RecipeListState): Extract<RecipeListState, { kind: "ready" }> {
  if (state.kind !== "ready") throw new Error("The list would still be loading");
  return state;
}

// Each shown row as "Title | note | note", for readable expectations.
export function shownRows(state: RecipeListState): string[] {
  return readyList(state).rows.map((row) => [row.recipe.title, ...row.notes.map((note) => note.text)].join(" | "));
}
