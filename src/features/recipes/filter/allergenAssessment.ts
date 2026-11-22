// What Feast can say about a recipe's allergens (#10, N-04), worked out when the recipe is
// read from its ingredient rows and the ingredient catalog on the phone. Never stored.
//
// The rules (health risk, so they fail closed):
// - A listed allergen always counts, reviewed or not. A list is evidence that an allergen
//   is there; a missing allergen is never evidence that it isn't.
// - A row with no valid catalog match is "couldn't check", never "no allergens".
// - Absence is only "checked" when every row matched an ingredient whose allergens have
//   been reviewed. With today's data (nothing reviewed yet) no recipe is fully checked.
import { findCheckedMatch } from "@/repositories/checkedCatalogMatch";
import type { Allergen, IngredientCatalog } from "@/repositories/IngredientCatalog";
import type { Recipe } from "@/repositories/RecipeRepository";
import { normaliseName } from "@/validation/clean";
import { ALLERGENS, inVocabularyOrder } from "@/validation/recipeSchema";

export type AllergenAssessment = {
  // Every allergen listed by a matched ingredient (plus any declared ones), in ALLERGENS order.
  contains: Allergen[];
  // Names of the rows with no valid match, as written, each once, in recipe order.
  unmatchedNames: string[];
  // True if at least one matched ingredient's allergens haven't been reviewed.
  usesUnreviewedData: boolean;
  // True only if every row matched a reviewed ingredient (and there is at least one row).
  fullyChecked: boolean;
};

export type RecipeForAssessment = Pick<Recipe, "ingredients">;

const inAllergenOrder = inVocabularyOrder(ALLERGENS);

// `declared` is for allergens the recipe's author marks themselves (Phase 3, not built):
// they are added to what the catalog finds, never subtracted from it.
export function assessRecipeAllergens(
  recipe: RecipeForAssessment,
  catalog: IngredientCatalog,
  declared: readonly Allergen[] = [],
): AllergenAssessment {
  const contains = new Set<Allergen>(declared);
  const unmatchedNames: string[] = [];
  const unmatchedKeys = new Set<string>();
  let usesUnreviewedData = false;

  for (const row of recipe.ingredients) {
    const match = findCheckedMatch(catalog, row);
    if (match === undefined) {
      // "Flour" and "flour " are the same unmatched ingredient: name it once.
      const key = normaliseName(row.name);
      if (!unmatchedKeys.has(key)) {
        unmatchedKeys.add(key);
        unmatchedNames.push(row.name);
      }
      continue;
    }
    for (const allergen of match.allergens ?? []) contains.add(allergen);
    if (match.allergensReviewed !== true) usesUnreviewedData = true;
  }

  return {
    contains: inAllergenOrder([...contains]),
    unmatchedNames,
    usesUnreviewedData,
    // A recipe with no rows can't be saved, but if one turns up it isn't "checked".
    fullyChecked: recipe.ingredients.length > 0 && unmatchedNames.length === 0 && !usesUnreviewedData,
  };
}
