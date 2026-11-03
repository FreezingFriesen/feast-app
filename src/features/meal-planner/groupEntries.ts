import type { MealPlanEntry } from "@/repositories/MealPlanRepository";
import { PLANNER_MEAL_TYPES, type PlannerMealType } from "@/validation/mealPlanSchema";
import type { DateKey } from "./dates";

// One day's meals: { breakfast: [...], lunch: [...], dinner: [...] }.
export type DaySlotEntries = Record<PlannerMealType, MealPlanEntry[]>;

// A day with nothing planned: every slot is an empty list.
export function emptyDaySlots(): DaySlotEntries {
  return Object.fromEntries(PLANNER_MEAL_TYPES.map((mealType) => [mealType, []])) as unknown as DaySlotEntries;
}

// date -> { breakfast: [...], lunch: [...], dinner: [...] }, each slot oldest first.
export function groupByDay(entries: readonly MealPlanEntry[]): Map<DateKey, DaySlotEntries> {
  const days = new Map<DateKey, DaySlotEntries>();
  // Sort a copy (oldest first) so the list passed in isn't changed, then put each
  // entry in its day's slot, creating the day the first time it's seen.
  for (const entry of [...entries].sort((a, b) => a.createdAt - b.createdAt)) {
    let slots = days.get(entry.date);
    if (!slots) {
      slots = emptyDaySlots();
      days.set(entry.date, slots);
    }
    slots[entry.mealType].push(entry);
  }
  return days;
}
