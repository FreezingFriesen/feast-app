import type { MealPlanWriteResult } from "@/repositories/MealPlanRepository";
import { MAX_ENTRIES_PER_SLOT } from "@/validation/mealPlanSchema";

// Message to show when a meal plan write is rejected.
// slot_full: the slot already has the most meals allowed. not_found: the meal was
// removed. invalid: the data didn't pass validation.
export function writeErrorMessage(result: Extract<MealPlanWriteResult, { ok: false }>): string {
  switch (result.reason) {
    case "slot_full":
      return `That slot already has ${MAX_ENTRIES_PER_SLOT} recipes.`;
    case "not_found":
      return "This meal is no longer in your plan.";
    case "invalid":
      return "This meal could not be saved. Please try again.";
  }
}
