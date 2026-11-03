import type { DIET_TAGS, MEAL_TYPES, UNITS } from "@/validation/recipeSchema";

// Form state is kept as text, exactly as typed. It is converted with
// toRecipeInput() and then checked by recipeSchema. No validation happens here.

// One ingredient row as typed. unit is "" until a unit chip is picked.
export type IngredientFormRow = {
  key: string; // stable React key, not saved
  name: string;
  quantity: string;
  unit: (typeof UNITS)[number] | "";
};

// The whole form. Numbers are kept as text until toRecipeInput converts them.
export type RecipeFormValues = {
  title: string;
  description: string;
  servings: string;
  prepTimeMinutes: string;
  cookTimeMinutes: string;
  mealTypes: (typeof MEAL_TYPES)[number][];
  ingredients: IngredientFormRow[];
  steps: { key: string; text: string }[];
  dietTags: (typeof DIET_TAGS)[number][];
  notes: string;
};

// The most rows the form allows. These match the limits in recipeSchema.
export const MAX_INGREDIENT_ROWS = 50;
export const MAX_STEP_ROWS = 50;

// Gives every new row a unique key ("row-1", "row-2", ...). React uses it to keep
// each row's text in the right place when another row is removed.
let rowCounter = 0;
export function newRowKey(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

// A blank ingredient row.
export function emptyIngredientRow(): IngredientFormRow {
  return { key: newRowKey(), name: "", quantity: "", unit: "" };
}

// A blank step row.
export function emptyStepRow(): { key: string; text: string } {
  return { key: newRowKey(), text: "" };
}

// A new, empty recipe form. Starts with one ingredient row and one step row.
export function emptyRecipeForm(): RecipeFormValues {
  return {
    title: "",
    description: "",
    servings: "",
    prepTimeMinutes: "",
    cookTimeMinutes: "",
    mealTypes: [],
    ingredients: [emptyIngredientRow()],
    steps: [emptyStepRow()],
    dietTags: [],
    notes: "",
  };
}

// Empty -> undefined (so "required" errors show), otherwise an explicit Number().
// "abc" becomes NaN, which recipeSchema rejects.
function toNumber(text: string): number | undefined {
  const trimmed = text.trim();
  return trimmed === "" ? undefined : Number(trimmed);
}

// Blank (or only spaces) -> undefined, so an empty optional box isn't saved as "".
function toOptionalText(text: string): string | undefined {
  return text.trim() === "" ? undefined : text;
}

// Row order is kept as-is so error paths (e.g. ingredients.2.quantity)
// line up with the rows on screen.
// Turns the typed form into the shape recipeSchema checks: numbers instead of text,
// blank optional boxes left out, and the React row keys dropped.
export function toRecipeInput(values: RecipeFormValues): unknown {
  return {
    title: values.title,
    description: toOptionalText(values.description),
    servings: toNumber(values.servings),
    prepTimeMinutes: toNumber(values.prepTimeMinutes),
    cookTimeMinutes: toNumber(values.cookTimeMinutes),
    mealTypes: values.mealTypes,
    ingredients: values.ingredients.map((row) => ({
      name: row.name,
      quantity: toNumber(row.quantity),
      unit: row.unit === "" ? undefined : row.unit,
    })),
    steps: values.steps.map((step) => step.text),
    dietTags: values.dietTags,
    notes: toOptionalText(values.notes),
  };
}
