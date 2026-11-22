// src/validation/recipeFilterSchema.ts
// The filters and sort chosen on the Recipes tab (#10, N-03, N-04). They live in memory
// only (never stored, never in a route), but every change is checked with this schema
// before it's applied, so a bad value can never select a filter or sort field. If a check
// fails, the screen keeps the previous filters: a partial filter is never applied.
import { z } from "zod";
import { ALLERGENS, DIET_TAGS, inVocabularyOrder, MEAL_TYPES } from "./recipeSchema";

// How the list can be sorted. "newest" is the most recently edited first (updatedAt).
export const RECIPE_SORTS = ["newest", "title", "quickest"] as const;
export type RecipeSort = (typeof RECIPE_SORTS)[number];

// Fixed lists only (z.enum), each value at most once and in vocabulary order, so the same
// choices always compare equal. The user's profile restrictions aren't part of this: they
// come from the profile, which has its own schema (dietaryRestrictionsSchema).
export const recipeFilterSchema = z
  .object({
    // Keep only recipes tagged with every one of these diets.
    diets: z.array(z.enum(DIET_TAGS)).max(DIET_TAGS.length).transform(inVocabularyOrder(DIET_TAGS)),
    // Hide recipes known to contain any of these.
    excludeAllergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).transform(inVocabularyOrder(ALLERGENS)),
    // Keep only recipes tagged with at least one of these meal types.
    mealTypes: z.array(z.enum(MEAL_TYPES)).max(MEAL_TYPES.length).transform(inVocabularyOrder(MEAL_TYPES)),
    // While allergens are left out, also hide recipes with ingredients that couldn't be checked.
    hideUnchecked: z.boolean(),
    sort: z.enum(RECIPE_SORTS),
  })
  .strict();

export type RecipeFilter = z.output<typeof recipeFilterSchema>;

// What the Recipes tab starts with: no filters of its own, newest first. The profile
// filter is separate and starts on.
export const DEFAULT_RECIPE_FILTER: RecipeFilter = {
  diets: [],
  excludeAllergens: [],
  mealTypes: [],
  hideUnchecked: false,
  sort: "newest",
};
