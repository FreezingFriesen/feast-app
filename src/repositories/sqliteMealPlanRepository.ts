import { domainError } from "@/services/domainErrors";
import type { SqlDatabase } from "@/storage/SqlDatabase";
import {
  dateKeySchema,
  MAX_ENTRIES_PER_SLOT,
  MEAL_PLAN_ENTRY_SCHEMA_VERSION,
  mealPlanEntrySchema,
  mealPlanEntryUpdateSchema,
  storedMealPlanEntrySchema,
} from "@/validation/mealPlanSchema";
import type { MealPlanEntry, MealPlanRepository, StoredMealPlanEntry } from "./MealPlanRepository";
import { isRecordId, isTimestamp, newRecordId, nextUpdatedAt, withoutUndefined } from "./records";
import { isPendingLimit, type PendingRecord } from "./Syncable";

// One row of the meal_plan_entries table, as SQLite returns it.
type EntryRow = {
  id: string;
  date: string;
  meal_type: string;
  recipe_id: string;
  servings: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  schema_version: number;
};

// Constant SQL only; every value is a "?" parameter. Ties are broken by rowid (the order
// the rows were first added), the same order the in-memory version keeps.
const SELECT_LIVE_BY_ID = `SELECT id, date, meal_type, recipe_id, servings, created_at, updated_at, deleted_at, schema_version
  FROM meal_plan_entries WHERE id = ? AND deleted_at IS NULL`;
// Date keys are "YYYY-MM-DD", so text comparison is date order.
const SELECT_LIVE_BETWEEN = `SELECT id, date, meal_type, recipe_id, servings, created_at, updated_at, deleted_at, schema_version
  FROM meal_plan_entries WHERE deleted_at IS NULL AND date >= ? AND date <= ? ORDER BY created_at, rowid`;
const SELECT_PENDING = `SELECT id, date, meal_type, recipe_id, servings, created_at, updated_at, deleted_at, schema_version
  FROM meal_plan_entries WHERE dirty = 1 ORDER BY updated_at, rowid LIMIT ?`;
const COUNT_PENDING = "SELECT COUNT(*) AS count FROM meal_plan_entries WHERE dirty = 1";
// The slot check and the write are one statement, so two adds at the same time can't
// both see room for one more entry. Nothing is inserted if the slot is full.
const INSERT_IF_ROOM = `INSERT INTO meal_plan_entries
    (id, date, meal_type, recipe_id, servings, created_at, updated_at, deleted_at, schema_version, dirty)
  SELECT ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1
  WHERE (SELECT COUNT(*) FROM meal_plan_entries
         WHERE date = ? AND meal_type = ? AND deleted_at IS NULL) < ?`;
// The same for an update, in one statement: only if the row is still the one that was
// read (same updated_at), so a download that landed in between is never overwritten by
// an edit made from the older copy; and, for a move to another slot, only if that slot
// has room. An entry that stays in its slot can always be edited, even in a slot that a
// download filled past the limit. (WHERE sees the row before the update.)
const UPDATE_IF_UNCHANGED_AND_ROOM = `UPDATE meal_plan_entries SET date = ?, meal_type = ?, servings = ?, updated_at = ?, dirty = 1
  WHERE id = ? AND deleted_at IS NULL AND updated_at = ?
    AND ((date = ? AND meal_type = ?)
      OR (SELECT COUNT(*) FROM meal_plan_entries AS other
          WHERE other.date = ? AND other.meal_type = ? AND other.deleted_at IS NULL AND other.id <> ?) < ?)`;
const REMOVE_IF_UNCHANGED = `UPDATE meal_plan_entries SET deleted_at = ?, updated_at = ?, dirty = 1
  WHERE id = ? AND deleted_at IS NULL AND updated_at = ?`;
// Only if nothing changed since the upload started.
const MARK_SYNCED = "UPDATE meal_plan_entries SET dirty = 0 WHERE id = ? AND updated_at = ? AND dirty = 1";
// Last edit wins inside SQLite (the same rule as incomingWins in records.ts): an existing
// row is replaced only by a newer copy, and a deleted row only by a copy that is also
// deleted. Downloaded rows have nothing to upload (dirty = 0).
const UPSERT_IF_NEWER = `INSERT INTO meal_plan_entries
    (id, date, meal_type, recipe_id, servings, created_at, updated_at, deleted_at, schema_version, dirty)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  ON CONFLICT(id) DO UPDATE SET
    date = excluded.date,
    meal_type = excluded.meal_type,
    recipe_id = excluded.recipe_id,
    servings = excluded.servings,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at,
    schema_version = excluded.schema_version,
    dirty = 0
  WHERE excluded.updated_at > meal_plan_entries.updated_at
    AND (meal_plan_entries.deleted_at IS NULL OR excluded.deleted_at IS NOT NULL)`;
const DELETE_ALL = "DELETE FROM meal_plan_entries";

// How many times an edit is tried when a download changes the row between reading and
// writing it. More than one retry in a row is very unlikely.
const MAX_EDIT_ATTEMPTS = 3;

// Rows read back are untrusted like any stored data: a row that fails validation reads
// as missing instead of reaching the screens or being uploaded.
function toRecord(row: EntryRow | null): PendingRecord<StoredMealPlanEntry> | undefined {
  if (!row || !isRecordId(row.id)) return undefined;
  const result = storedMealPlanEntrySchema.safeParse(
    withoutUndefined({
      date: row.date,
      mealType: row.meal_type,
      recipeId: row.recipe_id,
      servings: row.servings,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? undefined,
      schemaVersion: row.schema_version,
    }),
  );
  return result.success ? { id: row.id, data: result.data } : undefined;
}

const toEntry = ({ id, data }: PendingRecord<StoredMealPlanEntry>): MealPlanEntry => ({ ...data, id });

// Every valid row, skipping any that fail validation.
const validRecords = (rows: EntryRow[]) =>
  rows.flatMap((row) => {
    const record = toRecord(row);
    return record ? [record] : [];
  });

// The meal plan in the device's SQLite database: the offline-first source of truth (#1).
// Sync uploads changes later (last edit wins).
// "now" is the clock, so tests can control the timestamps.
export function createSqliteMealPlanRepository(
  db: SqlDatabase,
  now: () => number = Date.now,
): MealPlanRepository {
  // The screens to tell when something changes (see subscribe below).
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  // Reads one entry that isn't removed. An invalid ID never reaches the database.
  async function findLive(id: string): Promise<PendingRecord<StoredMealPlanEntry> | undefined> {
    if (!isRecordId(id)) return undefined;
    return toRecord(await db.getFirstAsync<EntryRow>(SELECT_LIVE_BY_ID, [id]));
  }

  return {
    async add(input) {
      // The repository check is the one that counts: validate before every write.
      const result = mealPlanEntrySchema.safeParse(input);
      if (!result.success) {
        return { ok: false, reason: "invalid", error: result.error };
      }

      // Save the cleaned data (result.data), plus the fields the repository sets.
      // The whole record is checked too (e.g. a phone clock set before 2020).
      const timestamp = now();
      const stored = storedMealPlanEntrySchema.safeParse({
        ...result.data,
        createdAt: timestamp,
        updatedAt: timestamp,
        schemaVersion: MEAL_PLAN_ENTRY_SCHEMA_VERSION,
      });
      if (!stored.success) {
        return { ok: false, reason: "invalid", error: stored.error };
      }

      const record = { id: newRecordId("meal plan entry"), data: withoutUndefined(stored.data) };
      const { data } = record;
      const { changes } = await db.runAsync(INSERT_IF_ROOM, [
        record.id,
        data.date,
        data.mealType,
        data.recipeId,
        data.servings,
        data.createdAt,
        data.updatedAt,
        data.schemaVersion,
        data.date,
        data.mealType,
        MAX_ENTRIES_PER_SLOT,
      ]);
      if (changes === 0) {
        return { ok: false, reason: "slot_full" };
      }
      notify();
      return { ok: true, entry: toEntry(record) };
    },

    // The patch holds only what changed (date, meal type and/or servings).
    async update(id, patch) {
      for (let attempt = 0; attempt < MAX_EDIT_ATTEMPTS; attempt += 1) {
        const existing = await findLive(id);
        if (!existing) {
          return { ok: false, reason: "not_found" };
        }
        const parsedPatch = mealPlanEntryUpdateSchema.safeParse(patch);
        if (!parsedPatch.success) {
          return { ok: false, reason: "invalid", error: parsedPatch.error };
        }

        // Validate the merged entry too, so an update can never store an invalid record.
        // A new updatedAt, so this edit wins over older copies when syncing.
        const merged = storedMealPlanEntrySchema.safeParse({
          ...existing.data,
          date: parsedPatch.data.date ?? existing.data.date,
          mealType: parsedPatch.data.mealType ?? existing.data.mealType,
          servings: parsedPatch.data.servings ?? existing.data.servings,
          updatedAt: nextUpdatedAt(now, existing.data.updatedAt),
        });
        if (!merged.success) {
          return { ok: false, reason: "invalid", error: merged.error };
        }

        const record = { id, data: withoutUndefined(merged.data) };
        const { data } = record;
        const { changes } = await db.runAsync(UPDATE_IF_UNCHANGED_AND_ROOM, [
          data.date,
          data.mealType,
          data.servings,
          data.updatedAt,
          id,
          existing.data.updatedAt,
          data.date,
          data.mealType,
          data.date,
          data.mealType,
          id,
          MAX_ENTRIES_PER_SLOT,
        ]);
        if (changes > 0) {
          notify();
          return { ok: true, entry: toEntry(record) };
        }

        // Nothing was written. Read the entry again to find out why: it was removed, the
        // slot is full (the entry is unchanged), or a download changed it since it was
        // read (try again with the copy that is there now).
        const current = await findLive(id);
        if (!current) {
          return { ok: false, reason: "not_found" };
        }
        if (current.data.updatedAt === existing.data.updatedAt) {
          return { ok: false, reason: "slot_full" };
        }
      }
      throw domainError("storage_failed");
    },

    async remove(id) {
      for (let attempt = 0; attempt < MAX_EDIT_ATTEMPTS; attempt += 1) {
        const existing = await findLive(id);
        if (!existing) return false;

        // Soft delete, so a later sync cannot bring the entry back.
        const timestamp = nextUpdatedAt(now, existing.data.updatedAt);
        const stored = storedMealPlanEntrySchema.safeParse({
          ...existing.data,
          deletedAt: timestamp,
          updatedAt: timestamp,
        });
        if (!stored.success) return false;

        const { changes } = await db.runAsync(REMOVE_IF_UNCHANGED, [
          timestamp,
          timestamp,
          id,
          existing.data.updatedAt,
        ]);
        if (changes > 0) {
          notify();
          return true;
        }
        // Changed since it was read (see update): try again.
      }
      throw domainError("storage_failed");
    },

    async listBetween(startDate, endDate) {
      // Invalid dates return nothing rather than an error, and never reach the database.
      if (!dateKeySchema.safeParse(startDate).success || !dateKeySchema.safeParse(endDate).success) {
        return [];
      }
      const rows = await db.getAllAsync<EntryRow>(SELECT_LIVE_BETWEEN, [startDate, endDate]);
      return validRecords(rows).map(toEntry);
    },

    async getById(id) {
      const record = await findLive(id);
      return record ? toEntry(record) : undefined;
    },

    // A row that fails validation is skipped: it can't be uploaded, so it stays pending.
    async listPending(limit) {
      if (!isPendingLimit(limit)) return [];
      return validRecords(await db.getAllAsync<EntryRow>(SELECT_PENDING, [limit]));
    },

    async pendingCount() {
      const row = await db.getFirstAsync<{ count: number }>(COUNT_PENDING, []);
      return row?.count ?? 0;
    },

    async markSynced(id, updatedAt) {
      if (!isRecordId(id) || !isTimestamp(updatedAt)) return false;
      const { changes } = await db.runAsync(MARK_SYNCED, [id, updatedAt]);
      return changes > 0;
    },

    async mergeIncoming(id, data) {
      if (!isRecordId(id)) return "invalid";
      const result = storedMealPlanEntrySchema.safeParse(data);
      if (!result.success) return "invalid";

      // No slot limit here. The limit is this repository's rule for local edits; the
      // server doesn't enforce it, so refusing a download would leave this phone with a
      // different plan from the others. A slot may end up with more than 10 entries.
      // "changes" is how many rows SQLite wrote: 0 means the local copy was kept.
      const incoming = withoutUndefined(result.data);
      const { changes } = await db.runAsync(UPSERT_IF_NEWER, [
        id,
        incoming.date,
        incoming.mealType,
        incoming.recipeId,
        incoming.servings,
        incoming.createdAt,
        incoming.updatedAt,
        incoming.deletedAt ?? null,
        incoming.schemaVersion,
      ]);
      if (changes === 0) return "kept_local";
      notify();
      return "applied";
    },

    async clear() {
      await db.runAsync(DELETE_ALL, []);
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
