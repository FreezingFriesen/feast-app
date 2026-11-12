// The checks both grocery repositories (in-memory and SQLite) run before every write and
// on every row read back, so the two can't drift apart.
import type { z } from "zod";
import {
  GROCERY_ITEM_SCHEMA_VERSION,
  groceryCheckChangeSchema,
  groceryItemKeySchema,
  manualGroceryItemSchema,
  storedManualGroceryItemSchema,
} from "@/validation/groceryItemSchema";
import type { StoredManualGroceryItem } from "./GroceryRepository";
import { newRecordId, withoutUndefined } from "./records";

type Prepared<T> = { ok: true; value: T } | { ok: false; error: z.ZodError };

// A check change, validated: the week must be a Monday and the key cleaned text of 1 to
// 250 characters. The parsed (cleaned) key is the one to store.
export function prepareCheckChange(
  weekStart: unknown,
  itemKey: unknown,
  checked: unknown,
): Prepared<{ weekStart: string; itemKey: string; checked: boolean }> {
  const result = groceryCheckChangeSchema.safeParse({ weekStart, itemKey, checked });
  return result.success ? { ok: true, value: result.data } : { ok: false, error: result.error };
}

// A new manual item, validated twice: the typed fields with manualGroceryItemSchema (the
// form's own rules), then the whole record with the fields the repository sets (the week,
// unchecked, the time). Returns the record to store under a new, safe ID.
export function prepareManualItem(
  weekStart: unknown,
  input: unknown,
  now: () => number,
): Prepared<{ id: string; data: StoredManualGroceryItem }> {
  const parsed = manualGroceryItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error };
  const stored = storedManualGroceryItemSchema.safeParse({
    ...parsed.data,
    weekStart,
    checked: false,
    createdAt: now(),
    schemaVersion: GROCERY_ITEM_SCHEMA_VERSION,
  });
  if (!stored.success) return { ok: false, error: stored.error };
  return { ok: true, value: { id: newRecordId("grocery item"), data: withoutUndefined(stored.data) } };
}

// A check key read back from storage, or undefined if it isn't one the app could have
// stored. It must come back exactly as stored: a tampered "flour\u0000" must not quietly
// become "flour" and check a different line.
export function readCheckKey(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const result = groceryItemKeySchema.safeParse(raw);
  return result.success && result.data === raw ? raw : undefined;
}
