import { storedManualGroceryItemSchema, weekStartSchema } from "@/validation/groceryItemSchema";
import {
  DEFAULT_GROCERY_LIMITS,
  type GroceryLimits,
  type GroceryRepository,
  type ManualGroceryItem,
  type StoredManualGroceryItem,
} from "./GroceryRepository";
import { prepareCheckChange, prepareManualItem } from "./groceryRecords";
import { isRecordId } from "./records";

// Grocery list state kept in memory: it lasts only while the app is open. Used by tests
// and by RepositoryProvider when no repositories are passed in; the app uses the SQLite
// version. Both pass the same contract tests, so they behave the same.
// "now" is the clock and "limits" the per-week caps, so tests can control both.
export function createInMemoryGroceryRepository(
  now: () => number = Date.now,
  limits: GroceryLimits = DEFAULT_GROCERY_LIMITS,
): GroceryRepository {
  // Checked line keys, by week.
  const checks = new Map<string, Set<string>>();
  // Manual items by ID, in the order they were added.
  const items = new Map<string, StoredManualGroceryItem>();
  // The screens to tell when something changes (see subscribe below).
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const isWeek = (weekStart: string) => weekStartSchema.safeParse(weekStart).success;
  const toItem = (id: string, data: StoredManualGroceryItem): ManualGroceryItem => ({ ...data, id });
  const itemsInWeek = (weekStart: string) => [...items].filter(([, item]) => item.weekStart === weekStart);

  return {
    async listCheckedKeys(weekStart) {
      if (!isWeek(weekStart)) return [];
      return [...(checks.get(weekStart) ?? [])].sort().slice(0, limits.maxCheckedItemsPerWeek);
    },

    async setChecked(weekStart, itemKey, checked) {
      // The repository check is the one that counts: validate before every write.
      const change = prepareCheckChange(weekStart, itemKey, checked);
      if (!change.ok) return { ok: false, reason: "invalid", error: change.error };

      const { weekStart: week, itemKey: key } = change.value;
      const keys = checks.get(week) ?? new Set<string>();
      if (change.value.checked) {
        if (keys.has(key)) return { ok: true };
        if (keys.size >= limits.maxCheckedItemsPerWeek) return { ok: false, reason: "limit" };
        keys.add(key);
        checks.set(week, keys);
      } else {
        if (!keys.delete(key)) return { ok: true };
        if (keys.size === 0) checks.delete(week);
      }
      notify();
      return { ok: true };
    },

    async listManualItems(weekStart) {
      if (!isWeek(weekStart)) return [];
      // Oldest first; items added at the same time keep the order they were added in.
      return itemsInWeek(weekStart)
        .sort(([, a], [, b]) => a.createdAt - b.createdAt)
        .slice(0, limits.maxManualItemsPerWeek)
        .map(([id, item]) => toItem(id, item));
    },

    async addManualItem(weekStart, input) {
      const prepared = prepareManualItem(weekStart, input, now);
      if (!prepared.ok) return { ok: false, reason: "invalid", error: prepared.error };

      const { id, data } = prepared.value;
      if (itemsInWeek(data.weekStart).length >= limits.maxManualItemsPerWeek) {
        return { ok: false, reason: "limit" };
      }
      items.set(id, data);
      notify();
      return { ok: true, item: toItem(id, data) };
    },

    async setManualItemChecked(id, checked) {
      if (!isRecordId(id) || typeof checked !== "boolean") return false;
      const existing = items.get(id);
      if (existing === undefined) return false;
      if (existing.checked === checked) return true;
      // Validate the changed record too, so a write can never store an invalid one.
      const updated = storedManualGroceryItemSchema.safeParse({ ...existing, checked });
      if (!updated.success) return false;
      items.set(id, updated.data);
      notify();
      return true;
    },

    async removeManualItem(id) {
      if (!isRecordId(id) || !items.delete(id)) return false;
      notify();
      return true;
    },

    async clear() {
      checks.clear();
      items.clear();
      notify();
    },

    // Screens call this to hear about changes. The function it returns stops listening.
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
