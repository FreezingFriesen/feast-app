import type { MealPlanEntry } from "@/repositories/MealPlanRepository";
import type { PlannerMealType } from "@/validation/mealPlanSchema";
import { useRouter } from "expo-router";
import type { DateKey } from "./dates";

// Routes inside the meal planner stack. Each target screen validates its params again.
// openDay: the day popup. addToSlot: the recipe picker for one slot.
// editEntry: the edit screen for one planned meal (only its ID goes in the link).
export function usePlannerNavigation() {
  const router = useRouter();
  return {
    openDay: (date: DateKey) =>
      router.push({ pathname: "/meal-planner/day/[date]", params: { date } }),
    addToSlot: (date: DateKey, mealType: PlannerMealType) =>
      router.push({ pathname: "/meal-planner/pick-recipe", params: { date, mealType } }),
    editEntry: (entry: MealPlanEntry) =>
      router.push({ pathname: "/meal-planner/entry/[id]", params: { id: entry.id } }),
  };
}
