// Reference data about ingredients (Edwin's dataset, `ingredients/{id}`), as the grocery
// list needs it: which ingredient a recipe row is, and how to convert its units. Screens
// get it through useIngredientCatalog(); the composition root picks the implementation.

// The ingredient a recipe row matched, with its conversion data. Either number may be
// missing: the list then says it can't combine those rows, it never guesses.
export type CatalogMatch = {
  id: string;
  gramsPerCup?: number;
  gramsPerPiece?: number;
};

// Finds the ingredient for one recipe row, by its ingredientId or its name (aliases
// included), or returns undefined when there is no match. Synchronous, so the grocery
// list can be worked out during a render; a real catalog loads its data first.
export type IngredientCatalog = {
  find(row: { ingredientId?: string; name: string }): CatalogMatch | undefined;
};

// The catalog the app uses today: it knows no ingredients. Nothing in the app reads the
// ingredients collection yet (the real catalog is a separate task), so rows are matched
// by name only, and rows in units that need conversion data are listed separately.
export const emptyIngredientCatalog: IngredientCatalog = Object.freeze({
  find: () => undefined,
});
