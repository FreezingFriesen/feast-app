import type { PlannerMealType } from "@/validation/mealPlanSchema";

// Used for the slot markers in DaySlots and the dots in MonthGrid.
// Breakfast is orange, lunch is green and dinner is blue.
export const MEAL_TYPE_COLORS: Record<PlannerMealType, string> = {
  breakfast: "#F2A007",
  lunch: "#2E9E5B",
  dinner: "#208AEF",
};
