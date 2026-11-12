// src/validation/recipeSchema.ts
// This file contains the schema for validating recipe data. 
// It uses the Zod library to define the structure and constraints of a recipe object, 
// including its title, description, servings, preparation and cooking times, 
// meal types, ingredients, steps, diet tags, and notes. 
// The schema ensures that the data adheres to specific rules, 
// such as length limits and allowed values.
import { z } from "zod";
import { cleanText } from "./clean";
import { ID_PATTERN, NAME_PATTERN } from "./patterns";
import { DATES_IN_ORDER_ISSUE, datesInOrder, noDuplicates, storedRecordFields } from "./storedRecord";

// The version of the stored recipe format. Raise it if the fields change.
export const RECIPE_SCHEMA_VERSION = 1;

// List and text limits. The Security Rules mirror the list sizes; they can't check the
// items inside a list (see the top of firestore.rules). The SQLite repository works out
// its JSON column caps from these.
export const MAX_INGREDIENTS = 50;
export const MAX_STEPS = 50;
export const MAX_STEP_LENGTH = 1000;
// For each of an ingredient row's ingredientId, name and note.
export const MAX_INGREDIENT_FIELD_LENGTH = 100;

// Constants for allowed values in the recipe schema
export const UNITS = ["g","kg","ml","l","tsp","tbsp","cup","oz","lb","piece","pinch"] as const;
export const DIET_TAGS = ["vegan","vegetarian","pescatarian","keto_friendly","gluten_free","dairy_free"] as const;
export const MEAL_TYPES = ["breakfast","lunch","dinner","snack"] as const;
// Health Canada's priority food allergens. Shared by recipes (computed from ingredients),
// user profiles (N-18) and the ingredient data, so all three use the same values.
export const ALLERGENS = ["peanuts","tree_nuts","milk","eggs","fish","shellfish","sesame","soy","wheat","mustard","sulphites"] as const;

// Helpers: clean the text first (remove control/invisible characters, trim),
// then check the length rules. Shared by the other schema files (ingredients, grocery
// items), so every name follows the same allowlist.
// safeText = free text (descriptions, steps, notes)
// safeName = short names (titles, ingredient names) with the character allowlist
export const safeText = (min: number, max: number) =>
  z.string().transform(cleanText).pipe(z.string().min(min).max(max));

export const safeName = (max: number) =>
  z.string().transform(cleanText).pipe(z.string().min(1).max(max).regex(NAME_PATTERN));

// Removes duplicates and sorts into vocabulary order, so the same choices are
// always stored the same way (the Security Rules reject duplicates).
export function inVocabularyOrder<T extends string>(vocabulary: readonly T[]) {
  return (values: T[]): T[] => vocabulary.filter((value) => values.includes(value));
}

// A recipe's ID, e.g. from the link that opens the edit screen. Route params can come
// from a deep link, so they are checked like any other user input.
export const recipeIdSchema = z.string().max(100).regex(ID_PATTERN);

// Schema for a single ingredient row in a recipe
export const ingredientRowSchema = z.object({
  ingredientId: z.string().max(MAX_INGREDIENT_FIELD_LENGTH).optional(),   // empty = unmatched
  name: safeName(MAX_INGREDIENT_FIELD_LENGTH),
  quantity: z.number().positive().max(100000),
  unit: z.enum(UNITS),
  note: safeText(0, MAX_INGREDIENT_FIELD_LENGTH).optional(),
});

// Main schema for validating a recipe object
export const recipeSchema = z.object({
  title: safeName(100),
  description: safeText(0, 500).optional(),
  servings: z.number().int().min(1).max(100),
  prepTimeMinutes: z.number().int().min(0).max(1440).optional(),
  cookTimeMinutes: z.number().int().min(0).max(1440).optional(),
  mealTypes: z.array(z.enum(MEAL_TYPES)).max(4).transform(inVocabularyOrder(MEAL_TYPES)).default([]),
  ingredients: z.array(ingredientRowSchema).min(1).max(MAX_INGREDIENTS),
  steps: z.array(safeText(1, MAX_STEP_LENGTH)).min(1).max(MAX_STEPS),
  dietTags: z.array(z.enum(DIET_TAGS)).max(6).transform(inVocabularyOrder(DIET_TAGS)).default([]),
  notes: safeText(0, 1000).optional(),
});

// A saved recipe as it is stored on the phone and synced: the recipe fields plus the
// fields the repository sets. Data read back from SQLite or downloaded is checked with
// this. It accepts the same fields as validRecipe in firestore.rules, and checks more
// inside the lists (each ingredient row and step), which the Rules can't.
// The tag lists are required here (the Rules require them) and can't hold duplicates.
export const storedRecipeSchema = recipeSchema
  .extend({
    mealTypes: z.array(z.enum(MEAL_TYPES)).max(4).refine(noDuplicates).transform(inVocabularyOrder(MEAL_TYPES)),
    dietTags: z.array(z.enum(DIET_TAGS)).max(6).refine(noDuplicates).transform(inVocabularyOrder(DIET_TAGS)),
    ...storedRecordFields(RECIPE_SCHEMA_VERSION),
  })
  .refine(datesInOrder, DATES_IN_ORDER_ISSUE);