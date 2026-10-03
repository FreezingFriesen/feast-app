import type { z } from "zod";
import type { DIET_TAGS, MEAL_TYPES, UNITS } from "@/validation/recipeSchema";

// Form state is kept as text, exactly as typed. It is converted with
// toRecipeInput() and then checked by recipeSchema. No validation happens here.

export type IngredientFormRow = {
  key: string; // stable React key, not saved
  name: string;
  quantity: string;
  unit: (typeof UNITS)[number] | "";
};

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

export const MAX_INGREDIENT_ROWS = 50;
export const MAX_STEP_ROWS = 50;

let rowCounter = 0;
export function newRowKey(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

export function emptyIngredientRow(): IngredientFormRow {
  return { key: newRowKey(), name: "", quantity: "", unit: "" };
}

export function emptyStepRow(): { key: string; text: string } {
  return { key: newRowKey(), text: "" };
}

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

function toOptionalText(text: string): string | undefined {
  return text.trim() === "" ? undefined : text;
}

// Row order is kept as-is so error paths (e.g. ingredients.2.quantity)
// line up with the rows on screen.
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

export type FieldErrors = Record<string, string>;

function friendlyMessage(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      if (issue.expected === "int") return "Enter a whole number";
      if (issue.expected === "number") return "Enter a number";
      return "Required";
    case "too_small":
      if (issue.origin === "array") return `Add at least ${issue.minimum}`;
      if (issue.origin === "string") return "Required";
      return `Must be at least ${issue.minimum}`;
    case "too_big":
      if (issue.origin === "array") return `No more than ${issue.maximum} allowed`;
      if (issue.origin === "string") return `Must be ${issue.maximum} characters or fewer`;
      return `Must be ${issue.maximum} or less`;
    case "invalid_format":
      return "Contains characters that are not allowed";
    case "invalid_value":
      return "Choose an option";
    default:
      return issue.message;
  }
}

// Maps schema issues to "ingredients.0.quantity" -> message. First issue per field wins.
export function issuesToFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    if (!(key in errors)) {
      errors[key] = friendlyMessage(issue);
    }
  }
  return errors;
}
