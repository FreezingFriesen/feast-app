// Remembers each recipe's allergen assessment, so changing a filter chip doesn't look up
// every ingredient row again. An assessment is kept while the recipe (its ID and
// updatedAt: every edit moves updatedAt forward) and the catalog snapshot (the store hands
// out a new object when the data changes) stay the same.
import type { IngredientCatalog } from "@/repositories/IngredientCatalog";
import type { Recipe } from "@/repositories/RecipeRepository";
import { assessRecipeAllergens, type AllergenAssessment } from "./allergenAssessment";

type Assess = (recipe: Recipe, catalog: IngredientCatalog) => AllergenAssessment;

export type AssessmentMemo = {
  // Assesses these recipes against this catalog, reusing what it can, and returns a
  // lookup for them. Keeps only these recipes, so memory doesn't grow with old edits.
  forCatalog(catalog: IngredientCatalog, recipes: readonly Recipe[]): (recipe: Recipe) => AllergenAssessment;
};

const keyOf = (recipe: Pick<Recipe, "id" | "updatedAt">) => `${recipe.id}|${recipe.updatedAt}`;

// The catalog's allergens plus the ones the author marked (#10). Marking more can only add
// warnings; an empty list subtracts nothing.
const assessWithMarked: Assess = (recipe, catalog) => assessRecipeAllergens(recipe, catalog, recipe.allergens);

export function createAssessmentMemo(assess: Assess = assessWithMarked): AssessmentMemo {
  let lastCatalog: IngredientCatalog | null = null;
  let cache = new Map<string, AllergenAssessment>();

  return {
    forCatalog(catalog, recipes) {
      // A new catalog snapshot can change any recipe's result, so start again.
      const previous = catalog === lastCatalog ? cache : new Map<string, AllergenAssessment>();
      const next = new Map<string, AllergenAssessment>();
      for (const recipe of recipes) {
        const key = keyOf(recipe);
        next.set(key, previous.get(key) ?? assess(recipe, catalog));
      }
      lastCatalog = catalog;
      cache = next;
      // A recipe that wasn't passed in is assessed on the spot (never a stale result).
      return (recipe) => next.get(keyOf(recipe)) ?? assess(recipe, catalog);
    },
  };
}
