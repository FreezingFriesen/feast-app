// Turns a list of validated ingredients into an IngredientCatalog the app can ask during a
// render. The index is built once per snapshot of the data, so each lookup is one Map
// read (O(1)) and hands out the same frozen object every time.
//
// Matching is exact on purpose, because a wrong match is worse than none, above all for
// allergens:
//   1. The row's ingredientId, if it is a valid ID and the catalog has it.
//   2. Otherwise the row's name, normalised (normaliseName), against each ingredient's
//      normalised name and aliases.
//   3. A name or alias that belongs to more than one ingredient matches nothing.
//   4. Never fuzzy, plural, substring or "contains" matching: "peanut butter" and
//      "butter" are different ingredients.
import { normaliseName } from "@/validation/clean";
import type { Ingredient } from "@/validation/ingredientSchema";
import { ID_PATTERN } from "@/validation/patterns";
import type { CatalogMatch, IngredientCatalog } from "./IngredientCatalog";

// A matching key that belongs to more than one ingredient, so it matches none of them.
export type NameCollision = { key: string; ids: string[] };

// Calls `visit` with every matching key (normalised name or alias) of every ingredient.
// A plain loop, not a generator: the catalog runs this over thousands of names.
function forEachNameKey(ingredients: readonly Ingredient[], visit: (key: string, id: string) => void) {
  for (const ingredient of ingredients) {
    visit(normaliseName(ingredient.name), ingredient.id);
    for (const alias of ingredient.aliases) visit(normaliseName(alias), ingredient.id);
  }
}

// The names and aliases shared by different ingredients, sorted, so the data can be fixed.
// The same name twice within one ingredient ("White bread" and the alias "white bread")
// is not a collision.
export function findNameCollisions(ingredients: readonly Ingredient[]): NameCollision[] {
  const idsByKey = new Map<string, Set<string>>();
  forEachNameKey(ingredients, (key, id) => {
    const ids = idsByKey.get(key) ?? new Set<string>();
    ids.add(id);
    idsByKey.set(key, ids);
  });
  return [...idsByKey]
    .filter(([, ids]) => ids.size > 1)
    .map(([key, ids]) => ({ key, ids: [...ids].sort() }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

// What the catalog hands out for one ingredient: frozen, so nothing that receives it can
// change the catalog for everyone else. Optional numbers are left out when unknown.
function toMatch(ingredient: Ingredient): CatalogMatch {
  return Object.freeze({
    id: ingredient.id,
    name: ingredient.name,
    ...(ingredient.gramsPerCup !== undefined ? { gramsPerCup: ingredient.gramsPerCup } : {}),
    ...(ingredient.gramsPerPiece !== undefined ? { gramsPerPiece: ingredient.gramsPerPiece } : {}),
    allergens: Object.freeze([...ingredient.allergens]),
    allergensReviewed: ingredient.allergensReviewed,
    dietTags: Object.freeze([...ingredient.dietTags]),
  });
}

// The catalog for these ingredients. Expects data that already passed
// storedIngredientSchema (the repository checks every row it reads), with unique IDs.
export function buildIngredientCatalog(ingredients: readonly Ingredient[]): IngredientCatalog {
  const byId = new Map<string, CatalogMatch>();
  // Each key's ingredient, or null once a different ingredient has claimed the same key.
  const byName = new Map<string, CatalogMatch | null>();
  const claim = (key: string, match: CatalogMatch) => {
    const owner = byName.get(key);
    if (owner === undefined) byName.set(key, match);
    else if (owner !== null && owner !== match) byName.set(key, null);
  };

  for (const ingredient of ingredients) {
    let match = byId.get(ingredient.id);
    if (match === undefined) {
      match = toMatch(ingredient);
      byId.set(ingredient.id, match);
    }
    claim(normaliseName(ingredient.name), match);
    for (const alias of ingredient.aliases) claim(normaliseName(alias), match);
  }

  return Object.freeze({
    find({ ingredientId, name }: { ingredientId?: string; name: string }): CatalogMatch | undefined {
      if (typeof ingredientId === "string" && ID_PATTERN.test(ingredientId)) {
        const match = byId.get(ingredientId);
        if (match !== undefined) return match;
      }
      return typeof name === "string" ? (byName.get(normaliseName(name)) ?? undefined) : undefined;
    },
  });
}
