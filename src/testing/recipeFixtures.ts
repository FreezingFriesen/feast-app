// Test-only builder for saved recipes. Made-up values: only the fields a test cares
// about are worth changing.
import type { Recipe } from "@/repositories/RecipeRepository";

type Row = Recipe["ingredients"][number];

// An ingredient row with this name (1 piece, unless the patch says otherwise).
export function row(name: string, patch: Partial<Row> = {}): Row {
  return { name, quantity: 1, unit: "piece", ...patch };
}

// A saved recipe with this ID. Its ingredients are `names` (one row each), or one
// "Water" row when none are given.
export function makeRecipe(id: string, patch: Partial<Recipe> = {}, names: readonly string[] = ["Water"]): Recipe {
  return {
    id,
    title: `Recipe ${id}`,
    servings: 4,
    mealTypes: [],
    ingredients: names.map((name) => row(name)),
    steps: ["Cook it."],
    dietTags: [],
    createdAt: Date.UTC(2026, 9, 1),
    updatedAt: Date.UTC(2026, 9, 1),
    schemaVersion: 1,
    ...patch,
  };
}
