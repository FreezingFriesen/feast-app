// Valid synced documents for sync tests, shaped exactly as firestore.rules allows.
export function recipeDocument(updatedAt: number, patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Pancakes",
    servings: 4,
    mealTypes: ["breakfast"],
    ingredients: [{ name: "Flour", quantity: 200, unit: "g" }],
    steps: ["Mix", "Cook"],
    dietTags: [],
    createdAt: updatedAt,
    updatedAt,
    schemaVersion: 1,
    ...patch,
  };
}

export function entryDocument(updatedAt: number, patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    date: "2026-10-19",
    mealType: "dinner",
    recipeId: "recipe-1",
    servings: 2,
    createdAt: updatedAt,
    updatedAt,
    schemaVersion: 1,
    ...patch,
  };
}

// What the new-recipe form sends to RecipeRepository.create.
export const RECIPE_FORM_INPUT = {
  title: "Grandma's apple pie",
  servings: 8,
  ingredients: [{ name: "Apples", quantity: 6, unit: "piece" }],
  steps: ["Bake it."],
};
