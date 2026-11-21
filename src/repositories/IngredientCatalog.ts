// Reference data about ingredients (Edwin's dataset, `ingredients/{id}`), as the app needs
// it: which ingredient a recipe row is, how to convert its units, and its safety tags.
// Screens get it through useIngredientCatalog(); the composition root picks where it comes
// from (the copy downloaded to the phone, see IngredientCatalogStore).
import type { ALLERGENS, DIET_TAGS } from "@/validation/recipeSchema";

export type Allergen = (typeof ALLERGENS)[number];
export type DietTag = (typeof DIET_TAGS)[number];

// The ingredient a recipe row matched. Either conversion number may be missing: the
// grocery list then says it can't combine those rows, it never guesses.
// The tags are optional so a catalog may leave them out. allergensReviewed false or
// missing means "allergens unknown": nothing may call the ingredient allergen-free.
export type CatalogMatch = {
  id: string;
  name?: string;
  gramsPerCup?: number;
  gramsPerPiece?: number;
  allergens?: readonly Allergen[];
  allergensReviewed?: boolean;
  dietTags?: readonly DietTag[];
};

// Finds the ingredient for one recipe row, by its ingredientId or its exact name (aliases
// included), or returns undefined when there is no match. Synchronous, so the grocery
// list can be worked out during a render; the store loads the data before handing it out.
export type IngredientCatalog = {
  find(row: { ingredientId?: string; name: string }): CatalogMatch | undefined;
};

// A catalog that knows no ingredients: what the app has before any ingredient data has
// been downloaded to the phone, and a handy default in tests. Rows are then matched by
// name only, and rows in units that need conversion data are listed separately.
export const emptyIngredientCatalog: IngredientCatalog = Object.freeze({
  find: () => undefined,
});
