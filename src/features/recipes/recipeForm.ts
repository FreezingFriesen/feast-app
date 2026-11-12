import type { RecipeData, RecipeUpdateResult } from "@/repositories/RecipeRepository";
import { cleanText } from "@/validation/clean";
import type { DIET_TAGS, MEAL_TYPES, UNITS } from "@/validation/recipeSchema";
import type { z } from "zod";

// Form state is kept as text, exactly as typed. It is converted with
// toRecipeInput() and then checked by recipeSchema. No validation happens here
// (cleanText is only used to compare names, never to check them).

// The ingredient a saved row was matched with, and the row's name at the time.
export type IngredientMatch = { ingredientId: string; name: string };

// One ingredient row as typed. unit is "" until a unit chip is picked.
export type IngredientFormRow = {
  key: string; // stable React key, not saved
  name: string;
  quantity: string;
  unit: (typeof UNITS)[number] | "";
  // Not shown in the form. Carried through unchanged, so editing a recipe doesn't erase it.
  note?: string;
  // Only on rows of a saved recipe that were matched with an ingredient. Kept only while
  // the name is unchanged (see keptIngredientId).
  match?: IngredientMatch;
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

// A number as text for a box, or "" if it isn't set. String() gives back exactly the
// same number through Number(), so a saved value is never rounded or cut short.
function toText(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

// A saved recipe as form values, for the edit screen. The reverse of toRecipeInput:
// numbers become text, optional fields that aren't set become "", and every row gets a
// fresh key. Values are copied as saved, never shortened or changed.
export function toRecipeForm(recipe: RecipeData): RecipeFormValues {
  return {
    title: recipe.title,
    description: recipe.description ?? "",
    servings: toText(recipe.servings),
    prepTimeMinutes: toText(recipe.prepTimeMinutes),
    cookTimeMinutes: toText(recipe.cookTimeMinutes),
    mealTypes: [...recipe.mealTypes],
    ingredients: recipe.ingredients.map((row) => ({
      key: newRowKey(),
      name: row.name,
      quantity: toText(row.quantity),
      unit: row.unit,
      note: row.note,
      match: row.ingredientId === undefined ? undefined : { ingredientId: row.ingredientId, name: row.name },
    })),
    steps: recipe.steps.map((text) => ({ key: newRowKey(), text })),
    dietTags: [...recipe.dietTags],
    notes: recipe.notes ?? "",
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

// The row's ingredientId, only while its name is still the one it was matched with.
// A renamed row reads as unmatched ("allergens unknown"), never as a stale match: a
// wrong allergen match is worse than none. Both names are cleaned first, so spaces
// around the name don't count as a rename.
function keptIngredientId(row: IngredientFormRow): string | undefined {
  if (row.match === undefined) return undefined;
  return cleanText(row.name) === cleanText(row.match.name) ? row.match.ingredientId : undefined;
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
      ingredientId: keptIngredientId(row),
      name: row.name,
      quantity: toNumber(row.quantity),
      unit: row.unit === "" ? undefined : row.unit,
      note: row.note,
    })),
    steps: values.steps.map((step) => step.text),
    dietTags: values.dietTags,
    notes: toOptionalText(values.notes),
  };
}

// The same choices, in any order. The tag lists never hold duplicates (chips toggle).
function sameChoices<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

// The same ingredient row, ignoring its React key.
function sameIngredient(a: IngredientFormRow, b: IngredientFormRow): boolean {
  return (
    a.name === b.name &&
    a.quantity === b.quantity &&
    a.unit === b.unit &&
    a.note === b.note &&
    a.match?.ingredientId === b.match?.ingredientId &&
    a.match?.name === b.match?.name
  );
}

// Has the user changed anything since the form opened? Text is compared as typed, tags
// in any order, and rows by position and content (row keys are ignored). The edit
// screen keeps its save button disabled until this is true.
export function isRecipeFormChanged(initial: RecipeFormValues, current: RecipeFormValues): boolean {
  const unchanged =
    initial.title === current.title &&
    initial.description === current.description &&
    initial.servings === current.servings &&
    initial.prepTimeMinutes === current.prepTimeMinutes &&
    initial.cookTimeMinutes === current.cookTimeMinutes &&
    initial.notes === current.notes &&
    sameChoices(initial.mealTypes, current.mealTypes) &&
    sameChoices(initial.dietTags, current.dietTags) &&
    initial.ingredients.length === current.ingredients.length &&
    initial.ingredients.every((row, index) => sameIngredient(row, current.ingredients[index])) &&
    initial.steps.length === current.steps.length &&
    initial.steps.every((step, index) => step.text === current.steps[index].text);
  return !unchanged;
}

// A text box's maxLength: the schema's limit, or the length of what's already in the box
// if that is longer. Android also cuts text the app puts in a box down to maxLength, so
// this stops a saved value (e.g. the quantity 0.30000000000000004) showing cut short.
// Typing can't go past the limit, so a new recipe's boxes always use the limit.
export function inputMaxLength(limit: number, value: string): number {
  return Math.max(limit, value.length);
}

// What a RecipeForm's onSubmit reports back: saved, errors to show under the fields, or
// one message for the whole form (e.g. the recipe was deleted in the meantime).
export type RecipeFormSubmitResult =
  | { ok: true }
  | { ok: false; error: z.ZodError }
  | { ok: false; message: string };

export const RECIPE_NOT_FOUND_MESSAGE = "This recipe is no longer available, so your changes weren't saved.";
export const RECIPE_SAVE_FAILED_MESSAGE = "Couldn't save your changes. Please try again.";

// What the form shows when an edit isn't saved. invalid: the repository's own check
// failed, so the errors go under the fields. not_found: the recipe was deleted (here or
// by a sync) since the screen opened.
export function recipeUpdateFailure(result: Extract<RecipeUpdateResult, { ok: false }>): RecipeFormSubmitResult {
  switch (result.reason) {
    case "invalid":
      return { ok: false, error: result.error };
    case "not_found":
      return { ok: false, message: RECIPE_NOT_FOUND_MESSAGE };
  }
}
