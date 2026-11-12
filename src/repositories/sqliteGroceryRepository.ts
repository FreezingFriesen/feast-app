import type { SqlDatabase } from "@/storage/SqlDatabase";
import { storedManualGroceryItemSchema, weekStartSchema } from "@/validation/groceryItemSchema";
import {
  DEFAULT_GROCERY_LIMITS,
  type GroceryLimits,
  type GroceryRepository,
  type ManualGroceryItem,
} from "./GroceryRepository";
import { prepareCheckChange, prepareManualItem, readCheckKey } from "./groceryRecords";
import { isRecordId, withoutUndefined } from "./records";

// One row of grocery_manual_items, as SQLite returns it.
type ItemRow = {
  id: string;
  week_start: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  checked: number;
  created_at: number;
  schema_version: number;
};

// Constant SQL only (written out in full, never built from parts); every value is a "?"
// parameter. Migration 5 made these tables.
const SELECT_ITEMS_IN_WEEK = `SELECT id, week_start, name, quantity, unit, checked, created_at, schema_version
  FROM grocery_manual_items WHERE week_start = ? ORDER BY created_at, rowid LIMIT ?`;
const SELECT_ITEM = `SELECT id, week_start, name, quantity, unit, checked, created_at, schema_version
  FROM grocery_manual_items WHERE id = ?`;
// The week's count and the write are one statement, so two adds at the same time can't
// both see room for one more item. Nothing is inserted if the week is full.
const INSERT_ITEM_IF_ROOM = `INSERT INTO grocery_manual_items
    (id, week_start, name, quantity, unit, checked, created_at, schema_version)
  SELECT ?, ?, ?, ?, ?, 0, ?, ?
  WHERE (SELECT COUNT(*) FROM grocery_manual_items WHERE week_start = ?) < ?`;
const UPDATE_ITEM_CHECKED = "UPDATE grocery_manual_items SET checked = ? WHERE id = ?";
const DELETE_ITEM = "DELETE FROM grocery_manual_items WHERE id = ?";
const DELETE_ALL_ITEMS = "DELETE FROM grocery_manual_items";

const SELECT_CHECKS_IN_WEEK = "SELECT item_key FROM grocery_checks WHERE week_start = ? ORDER BY item_key LIMIT ?";
const SELECT_CHECK = "SELECT item_key FROM grocery_checks WHERE week_start = ? AND item_key = ?";
// The same for check marks: only if the week has room and the line isn't checked already.
const INSERT_CHECK_IF_ROOM = `INSERT INTO grocery_checks (week_start, item_key)
  SELECT ?, ?
  WHERE (SELECT COUNT(*) FROM grocery_checks WHERE week_start = ?) < ?
    AND NOT EXISTS (SELECT 1 FROM grocery_checks WHERE week_start = ? AND item_key = ?)`;
const DELETE_CHECK = "DELETE FROM grocery_checks WHERE week_start = ? AND item_key = ?";
const DELETE_ALL_CHECKS = "DELETE FROM grocery_checks";

// Rows read back are untrusted like any stored data: a row that fails validation reads
// as missing instead of reaching the screen.
function toItem(row: ItemRow | null): ManualGroceryItem | undefined {
  if (!row || !isRecordId(row.id) || (row.checked !== 0 && row.checked !== 1)) return undefined;
  const result = storedManualGroceryItemSchema.safeParse(
    withoutUndefined({
      weekStart: row.week_start,
      name: row.name,
      quantity: row.quantity ?? undefined,
      unit: row.unit ?? undefined,
      checked: row.checked === 1,
      createdAt: row.created_at,
      schemaVersion: row.schema_version,
    }),
  );
  return result.success ? { ...result.data, id: row.id } : undefined;
}

// The user's grocery list state in the device's SQLite database (N-10). Local only:
// nothing here is synced. "now" is the clock and "limits" the per-week caps, so tests
// can control both.
export function createSqliteGroceryRepository(
  db: SqlDatabase,
  now: () => number = Date.now,
  limits: GroceryLimits = DEFAULT_GROCERY_LIMITS,
): GroceryRepository {
  // The screens to tell when something changes (see subscribe below).
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const isWeek = (weekStart: string) => weekStartSchema.safeParse(weekStart).success;

  // Reads one item. An invalid ID never reaches the database.
  async function findItem(id: string): Promise<ManualGroceryItem | undefined> {
    if (!isRecordId(id)) return undefined;
    return toItem(await db.getFirstAsync<ItemRow>(SELECT_ITEM, [id]));
  }

  return {
    async listCheckedKeys(weekStart) {
      // An invalid week returns nothing and never reaches the database.
      if (!isWeek(weekStart)) return [];
      const rows = await db.getAllAsync<{ item_key: unknown }>(SELECT_CHECKS_IN_WEEK, [
        weekStart,
        limits.maxCheckedItemsPerWeek,
      ]);
      return rows.flatMap((row) => {
        const key = readCheckKey(row.item_key);
        return key === undefined ? [] : [key];
      });
    },

    async setChecked(weekStart, itemKey, checked) {
      // The repository check is the one that counts: validate before every write.
      const change = prepareCheckChange(weekStart, itemKey, checked);
      if (!change.ok) return { ok: false, reason: "invalid", error: change.error };

      const { weekStart: week, itemKey: key } = change.value;
      if (!change.value.checked) {
        const { changes } = await db.runAsync(DELETE_CHECK, [week, key]);
        if (changes > 0) notify();
        return { ok: true };
      }
      const { changes } = await db.runAsync(INSERT_CHECK_IF_ROOM, [
        week,
        key,
        week,
        limits.maxCheckedItemsPerWeek,
        week,
        key,
      ]);
      if (changes > 0) {
        notify();
        return { ok: true };
      }
      // Nothing was written: the line was already checked, or the week is full.
      const existing = await db.getFirstAsync<{ item_key: string }>(SELECT_CHECK, [week, key]);
      return existing ? { ok: true } : { ok: false, reason: "limit" };
    },

    async listManualItems(weekStart) {
      if (!isWeek(weekStart)) return [];
      const rows = await db.getAllAsync<ItemRow>(SELECT_ITEMS_IN_WEEK, [weekStart, limits.maxManualItemsPerWeek]);
      return rows.flatMap((row) => {
        const item = toItem(row);
        return item ? [item] : [];
      });
    },

    async addManualItem(weekStart, input) {
      const prepared = prepareManualItem(weekStart, input, now);
      if (!prepared.ok) return { ok: false, reason: "invalid", error: prepared.error };

      // Save the cleaned data (the parsed result), never the raw input.
      const { id, data } = prepared.value;
      const { changes } = await db.runAsync(INSERT_ITEM_IF_ROOM, [
        id,
        data.weekStart,
        data.name,
        data.quantity ?? null,
        data.unit ?? null,
        data.createdAt,
        data.schemaVersion,
        data.weekStart,
        limits.maxManualItemsPerWeek,
      ]);
      if (changes === 0) return { ok: false, reason: "limit" };
      notify();
      return { ok: true, item: { ...data, id } };
    },

    async setManualItemChecked(id, checked) {
      if (typeof checked !== "boolean") return false;
      const existing = await findItem(id);
      if (!existing) return false;
      if (existing.checked === checked) return true;
      const { changes } = await db.runAsync(UPDATE_ITEM_CHECKED, [checked ? 1 : 0, id]);
      if (changes === 0) return false;
      notify();
      return true;
    },

    async removeManualItem(id) {
      if (!isRecordId(id)) return false;
      const { changes } = await db.runAsync(DELETE_ITEM, [id]);
      if (changes === 0) return false;
      notify();
      return true;
    },

    async clear() {
      // Both tables are tried even if the first fails, so as little as possible is left.
      const results = await Promise.allSettled([
        db.runAsync(DELETE_ALL_CHECKS, []),
        db.runAsync(DELETE_ALL_ITEMS, []),
      ]);
      notify();
      const failed = results.find((result) => result.status === "rejected");
      if (failed) throw failed.reason;
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
