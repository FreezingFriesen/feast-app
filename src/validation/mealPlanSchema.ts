// src/validation/mealPlanSchema.ts
import { z } from "zod";
import { DATE_KEY_PATTERN, ID_PATTERN } from "./patterns";
import type { MEAL_TYPES } from "./recipeSchema";

// The planner has Breakfast, Lunch and Dinner slots (#17). "snack" stays a recipe tag only.
export const PLANNER_MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const satisfies readonly (typeof MEAL_TYPES)[number][];
export type PlannerMealType = (typeof PLANNER_MEAL_TYPES)[number];

// Limits. Mirror these in the Firestore Security Rules for mealPlanEntries.
export const MIN_DATE_KEY = "2000-01-01";
export const MAX_DATE_KEY = "2100-12-31";
export const MAX_ENTRIES_PER_SLOT = 10;
export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 100;

// "2026-02-30" matches the pattern but is not a real day.
function isRealDate(key: string): boolean {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// A calendar day as "YYYY-MM-DD". Keys compare correctly as strings.
export const dateKeySchema = z
  .string()
  .max(10)
  .regex(DATE_KEY_PATTERN)
  .refine(isRealDate, "Not a real date")
  .refine((key) => key >= MIN_DATE_KEY && key <= MAX_DATE_KEY, "Date is out of range");

export const mealPlanEntryIdSchema = z.string().max(100).regex(ID_PATTERN);

// One recipe in one slot. Stores the recipe ID and servings, never a copy of the recipe.
export const mealPlanEntrySchema = z.object({
  date: dateKeySchema,
  mealType: z.enum(PLANNER_MEAL_TYPES),
  recipeId: z.string().max(100).regex(ID_PATTERN),
  servings: z.number().int().min(MIN_SERVINGS).max(MAX_SERVINGS),
});

// Moving an entry or changing its servings. The recipe cannot be changed.
export const mealPlanEntryUpdateSchema = mealPlanEntrySchema
  .pick({ date: true, mealType: true, servings: true })
  .partial();

// Route params that select a slot, e.g. /meal-planner/pick-recipe?date=2026-10-19&mealType=dinner
export const plannerSlotParamsSchema = mealPlanEntrySchema.pick({ date: true, mealType: true });
