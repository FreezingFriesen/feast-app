// Test-only builders for ingredients that pass storedIngredientSchema. Made-up values
// (not Edwin's data): only the fields a test cares about are worth changing.
import type { Ingredient } from "@/validation/ingredientSchema";

// A valid ingredient with this ID and name. Pass a patch for anything else.
export function makeIngredient(id: string, name: string, patch: Partial<Ingredient> = {}): Ingredient {
  return {
    id,
    name,
    aliases: [],
    category: "pantry",
    packagePrice: 3.99,
    packageSize: 1,
    packageUnit: "kg",
    priceSource: "Test Store",
    priceCollectedAt: "2026-10-13",
    currency: "CAD",
    region: "Alberta",
    caloriesPer100g: 100,
    proteinG: 1,
    carbsG: 1,
    fatG: 1,
    saturatedFatG: 0,
    fiberG: 0,
    sugarG: 0,
    sodiumMg: 0,
    nutritionSource: "Test Nutrition Data",
    allergens: [],
    allergensReviewed: false,
    dietTags: [],
    lastUpdated: "2026-10-13",
    ...patch,
  };
}

// `count` valid ingredients named "Ingredient 0", "Ingredient 1"..., each with
// `aliasCount` aliases of its own, IDs in order ("item_0000"...).
export function manyIngredients(count: number, aliasCount = 0): Ingredient[] {
  return Array.from({ length: count }, (_, n) =>
    makeIngredient(`item_${String(n).padStart(4, "0")}`, `Ingredient ${n}`, {
      aliases: Array.from({ length: aliasCount }, (_, a) => `Ingredient ${n} alias ${a}`),
      gramsPerCup: 100 + (n % 50),
    }),
  );
}
