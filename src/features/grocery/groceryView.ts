// What the Grocery screen shows around the list: row order, messages and labels, and
// which weeks can be opened. Pure functions, so they are tested without rendering.
import { addDays, startOfWeek, todayKey, type DateKey } from "@/features/meal-planner/dates";
import { dateKeySchema } from "@/validation/mealPlanSchema";
import { MAX_CHECKED_ITEMS_PER_WEEK, MAX_MANUAL_ITEMS_PER_WEEK, weekStartSchema } from "@/validation/groceryItemSchema";
import { formatAmount, spokenAmount } from "./formatQuantity";
import type { Unit } from "./units";

// Under a line whose ingredient is also on another line that couldn't be combined with it.
export const UNCOMBINED_CAPTION = "Also listed in another unit; can't combine without conversion data";

// The same items with the checked ones moved to the end, otherwise in the order given.
export function orderForDisplay<T>(items: readonly T[], isChecked: (item: T) => boolean): T[] {
  return [...items.filter((item) => !isChecked(item)), ...items.filter(isChecked)];
}

// The info message when planned meals were left out, or null when none were.
export function skippedMealsMessage(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "1 planned meal was left out because its recipe is no longer available."
    : `${count} planned meals were left out because their recipes are no longer available.`;
}

// An amount as shown on a row, or "" for a manual item without one.
export function amountText(quantity: number | undefined, unit: Unit | undefined): string {
  return quantity === undefined || unit === undefined ? "" : formatAmount(quantity, unit);
}

// What a screen reader says for a row: the name, the amount in words, and the note when
// the ingredient couldn't be combined. Checked or not comes from the checkbox state.
export function rowAccessibilityLabel(row: {
  name: string;
  quantity?: number;
  unit?: Unit;
  uncombined?: boolean;
}): string {
  const parts = [row.name];
  if (row.quantity !== undefined && row.unit !== undefined) parts.push(spokenAmount(row.quantity, row.unit));
  const label = parts.join(", ");
  return row.uncombined ? `${label}. Also listed in another unit` : label;
}

// Why a change to the list wasn't saved.
// check_limit / item_limit: the week has hit a cap. invalid: the data didn't pass the
// repository's check. failed: storage failed or the item no longer exists.
export type GroceryWriteProblem = "check_limit" | "item_limit" | "invalid" | "failed";

export function groceryWriteMessage(problem: GroceryWriteProblem): string {
  switch (problem) {
    case "check_limit":
      return `You can check off up to ${MAX_CHECKED_ITEMS_PER_WEEK} items in a week.`;
    case "item_limit":
      return `You can add up to ${MAX_MANUAL_ITEMS_PER_WEEK} items to a week's list.`;
    case "invalid":
      return "That item couldn't be saved. Check it and try again.";
    case "failed":
      return "Couldn't save that change. Please try again.";
  }
}

// The Monday of the current week.
export function currentWeekStart(now: () => number = Date.now): DateKey {
  return startOfWeek(todayKey(now));
}

// True if the week starting on `start` can be shown: a Monday whose whole week is inside
// the planner's date range (2000-01-01 to 2100-12-31). The arrows stop at the ends.
export function isNavigableWeek(start: DateKey): boolean {
  return weekStartSchema.safeParse(start).success && dateKeySchema.safeParse(addDays(start, 6)).success;
}
