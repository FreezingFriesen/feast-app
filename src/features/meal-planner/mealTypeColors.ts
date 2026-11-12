import type { IconName } from "@/components/DecorativeIcon";
import { mealTypeColors } from "@/theme";
import type { PlannerMealType } from "@/validation/mealPlanSchema";

// Used for the markers in MonthGrid. Breakfast is yellow, lunch is orange and dinner is
// green (src/theme/colors.ts). Each marker is drawn with MEAL_MARKER_OUTLINE, since
// yellow and orange alone don't stand out from a white background.
export const MEAL_TYPE_COLORS: Record<PlannerMealType, string> = {
  breakfast: mealTypeColors.breakfast,
  lunch: mealTypeColors.lunch,
  dinner: mealTypeColors.dinner,
};

export const MEAL_MARKER_OUTLINE = mealTypeColors.outline;

// The icon on each meal card in DaySlots, so the slot can be told apart without colour.
export const MEAL_TYPE_ICONS: Record<PlannerMealType, IconName> = {
  breakfast: "sunny-outline",
  lunch: "restaurant-outline",
  dinner: "moon-outline",
};
