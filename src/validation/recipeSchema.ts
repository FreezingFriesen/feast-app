// src/validation/recipeSchema.ts
import { z } from "zod";
import { cleanText } from "./clean";
import { NAME_PATTERN } from "./patterns";

export const UNITS = ["g","kg","ml","l","tsp","tbsp","cup","oz","lb","piece","pinch"] as const;
export const DIET_TAGS = ["vegan","vegetarian","pescatarian","keto_friendly","gluten_free","dairy_free"] as const;
export const MEAL_TYPES = ["breakfast","lunch","dinner","snack"] as const;

// Helpers: clean the text first (remove control/invisible characters, trim),
// then check the length rules.
// safeText = free text (descriptions, steps, notes)
// safeName = short names (titles, ingredient names) with the character allowlist
const safeText = (min: number, max: number) =>
  z.string().transform(cleanText).pipe(z.string().min(min).max(max));

const safeName = (max: number) =>
  z.string().transform(cleanText).pipe(z.string().min(1).max(max).regex(NAME_PATTERN));

export const ingredientRowSchema = z.object({
  ingredientId: z.string().max(100).optional(),   // empty = unmatched
  name: safeName(100),
  quantity: z.number().positive().max(100000),
  unit: z.enum(UNITS),
  note: safeText(0, 100).optional(),
});

export const recipeSchema = z.object({
  title: safeName(100),
  description: safeText(0, 500).optional(),
  servings: z.number().int().min(1).max(100),
  prepTimeMinutes: z.number().int().min(0).max(1440).optional(),
  cookTimeMinutes: z.number().int().min(0).max(1440).optional(),
  mealTypes: z.array(z.enum(MEAL_TYPES)).max(4).default([]),
  ingredients: z.array(ingredientRowSchema).min(1).max(50),
  steps: z.array(safeText(1, 1000)).min(1).max(50),
  dietTags: z.array(z.enum(DIET_TAGS)).max(6).default([]),
  notes: safeText(0, 1000).optional(),
});



//***How to use:***

//import { recipeSchema } from "@/src/validation/recipeSchema";

// const result = recipeSchema.safeParse(formValues);
// if (!result.success) {
//   // result.error.issues has the field and message for each problem
// } else {
//   // result.data is the cleaned, validated recipe; save this one, not formValues
// }