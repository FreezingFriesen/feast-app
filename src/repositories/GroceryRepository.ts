import type { z } from "zod";
import {
  MAX_CHECKED_ITEMS_PER_WEEK,
  MAX_MANUAL_ITEMS_PER_WEEK,
  type manualGroceryItemSchema,
  type storedManualGroceryItemSchema,
} from "@/validation/groceryItemSchema";

// The cleaned, validated fields of an item the user adds (output of manualGroceryItemSchema).
export type ManualGroceryItemData = z.output<typeof manualGroceryItemSchema>;

// A manual item as stored (output of storedManualGroceryItemSchema), without its ID.
export type StoredManualGroceryItem = z.output<typeof storedManualGroceryItemSchema>;

// A saved manual item. weekStart, checked and createdAt are set by the repository.
export type ManualGroceryItem = StoredManualGroceryItem & { id: string };

// The per-week caps. Passed in (like the clock) so tests can use small ones.
export type GroceryLimits = {
  maxManualItemsPerWeek: number;
  maxCheckedItemsPerWeek: number;
};

export const DEFAULT_GROCERY_LIMITS: GroceryLimits = Object.freeze({
  maxManualItemsPerWeek: MAX_MANUAL_ITEMS_PER_WEEK,
  maxCheckedItemsPerWeek: MAX_CHECKED_ITEMS_PER_WEEK,
});

// What setChecked() returns: saved, invalid week or key, or the week's check limit.
export type GroceryCheckResult =
  | { ok: true }
  | { ok: false; reason: "invalid"; error: z.ZodError }
  | { ok: false; reason: "limit" };

// What addManualItem() returns: the saved item, the validation errors, or the week's limit.
export type ManualItemAddResult =
  | { ok: true; item: ManualGroceryItem }
  | { ok: false; reason: "invalid"; error: z.ZodError }
  | { ok: false; reason: "limit" };

// The user's own grocery list state (N-10), per week: check marks on the generated lines
// and the items they add by hand. The generated list itself is never stored (it is worked
// out from the meal plan). Kept on this phone only: nothing here is synced.
// Screens depend on this interface only; implementations come through RepositoryProvider.
export type GroceryRepository = {
  // The keys of the checked generated lines for a week. An invalid week returns nothing.
  listCheckedKeys(weekStart: string): Promise<string[]>;
  // Checks or unchecks a generated line. Validates the week and key first. Checking an
  // already checked line, or unchecking one that isn't, changes nothing.
  setChecked(weekStart: string, itemKey: string, checked: boolean): Promise<GroceryCheckResult>;
  // A week's manual items, oldest first. An invalid week returns nothing.
  listManualItems(weekStart: string): Promise<ManualGroceryItem[]>;
  // Validates the input with manualGroceryItemSchema before writing. New items start unchecked.
  addManualItem(weekStart: string, input: unknown): Promise<ManualItemAddResult>;
  // False if the item doesn't exist (or the ID or value is invalid).
  setManualItemChecked(id: string, checked: boolean): Promise<boolean>;
  // Deletes the item (a real delete: nothing is synced, so no tombstone is needed).
  // False if it doesn't exist.
  removeManualItem(id: string): Promise<boolean>;
  // Removes everything from this device (logout wipe, account deletion).
  clear(): Promise<void>;
  // Calls the listener after every change. Returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
};
