// src/validation/groceryItemSchema.ts
// The user's own grocery list state (N-10): items they add by hand, and which lines of
// the generated list they have checked off. The generated list itself is worked out from
// the meal plan and never stored. Kept on the phone only (not synced, no Security Rules).
import { z } from "zod";
import { timestampSchema } from "./authSchema";
import { dateKeySchema, MAX_ENTRIES_PER_SLOT, PLANNER_MEAL_TYPES } from "./mealPlanSchema";
import { DATE_KEY_PATTERN } from "./patterns";
import { MAX_INGREDIENT_FIELD_LENGTH, MAX_INGREDIENTS, safeName, safeText, UNITS } from "./recipeSchema";

// The version of the stored manual item format. Raise it if the fields change.
export const GROCERY_ITEM_SCHEMA_VERSION = 1;

// Limits. The repository enforces the two caps; the schema checks the rest.
export const MAX_GROCERY_NAME_LENGTH = MAX_INGREDIENT_FIELD_LENGTH;
// The same as an ingredient row's quantity.
export const MAX_GROCERY_QUANTITY = 100_000;
export const MAX_ITEM_KEY_LENGTH = 250;
export const MAX_MANUAL_ITEMS_PER_WEEK = 100;
// The most lines a week's list can have: every ingredient row of every entry in every
// slot (7 days x 3 slots x 10 entries x 50 rows = 10,500). A real check is never refused;
// the cap only bounds a runaway or tampered table.
export const MAX_CHECKED_ITEMS_PER_WEEK = 7 * PLANNER_MEAL_TYPES.length * MAX_ENTRIES_PER_SLOT * MAX_INGREDIENTS;

// True if the "YYYY-MM-DD" key is a Monday. A calendar date has the same weekday in every
// time zone, so this works in UTC and the phone's time zone can't change the answer. It
// agrees with startOfWeek(key) === key in src/features/meal-planner/dates.ts (tested).
function isMonday(key: string): boolean {
  if (!DATE_KEY_PATTERN.test(key)) return false;
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 1;
}

// The week a list belongs to: its Monday (weeks start on Monday).
export const weekStartSchema = dateKeySchema.refine(isMonday, "Weeks start on Monday");

// Which generated line a check mark belongs to (the line's key, e.g. "name:flour|mass").
// Keys are built by the app, never typed, but they are checked like any stored text.
export const groceryItemKeySchema = safeText(1, MAX_ITEM_KEY_LENGTH);

// An amount needs a unit and a unit needs an amount. Each issue goes on the box that is
// missing, so the form can show it there.
const AMOUNT_NEEDS_UNIT = { path: ["unit"], message: "Choose a unit for the amount" };
const UNIT_NEEDS_AMOUNT = { path: ["quantity"], message: "Enter an amount for the unit" };
const amountHasUnit = (item: { quantity?: number; unit?: string }) =>
  item.quantity === undefined || item.unit !== undefined;
const unitHasAmount = (item: { quantity?: number; unit?: string }) =>
  item.unit === undefined || item.quantity !== undefined;

// The fields a user types. Kept as a plain shape so the stored schema can add to it
// (Zod doesn't let a refined schema be extended).
const manualItemFields = {
  // The same allowlist as an ingredient name.
  name: safeName(MAX_GROCERY_NAME_LENGTH),
  quantity: z.number().positive().max(MAX_GROCERY_QUANTITY).optional(),
  unit: z.enum(UNITS).optional(),
};

// An item the user adds to a week's list by hand ("Paper towels", "2 l milk").
export const manualGroceryItemSchema = z
  .object(manualItemFields)
  .refine(amountHasUnit, AMOUNT_NEEDS_UNIT)
  .refine(unitHasAmount, UNIT_NEEDS_AMOUNT);

// A manual item as stored on the phone: the typed fields plus the ones the repository
// sets. Rows read back from SQLite are checked with this. The ID is not a field.
export const storedManualGroceryItemSchema = z
  .object({
    ...manualItemFields,
    weekStart: weekStartSchema,
    checked: z.boolean(),
    createdAt: timestampSchema,
    schemaVersion: z.literal(GROCERY_ITEM_SCHEMA_VERSION),
  })
  .refine(amountHasUnit, AMOUNT_NEEDS_UNIT)
  .refine(unitHasAmount, UNIT_NEEDS_AMOUNT);

// One check mark on a generated line, as stored.
export const storedGroceryCheckSchema = z.object({
  weekStart: weekStartSchema,
  itemKey: groceryItemKeySchema,
});

// Checking or unchecking a line: which one, and the new state.
export const groceryCheckChangeSchema = storedGroceryCheckSchema.extend({
  checked: z.boolean(),
});
