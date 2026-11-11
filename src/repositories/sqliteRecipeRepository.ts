import { domainError } from "@/services/domainErrors";
import type { SqlDatabase, SqlValue } from "@/storage/SqlDatabase";
import {
  DIET_TAGS,
  MAX_INGREDIENT_FIELD_LENGTH,
  MAX_INGREDIENTS,
  MAX_STEP_LENGTH,
  MAX_STEPS,
  MEAL_TYPES,
  RECIPE_SCHEMA_VERSION,
  recipeSchema,
  storedRecipeSchema,
} from "@/validation/recipeSchema";
import type { Recipe, RecipeRepository, StoredRecipe } from "./RecipeRepository";
import {
  isRecordCursor,
  isRecordId,
  isTimestamp,
  newRecordId,
  nextUpdatedAt,
  pendingCursorParams,
  withoutUndefined,
} from "./records";
import { isPendingLimit, type PendingRecord } from "./Syncable";

// One row of the recipes table, as SQLite returns it. The four lists are JSON text;
// NULL means an optional field is not set.
type RecipeRow = {
  id: string;
  title: string;
  description: string | null;
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  meal_types: string;
  ingredients: string;
  steps: string;
  diet_tags: string;
  notes: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  schema_version: number;
};

// Constant SQL only; every value is a "?" parameter. Ties are broken by rowid (the order
// the rows were first added), the same order the in-memory version keeps.
const SELECT_LIVE_BY_ID = `SELECT id, title, description, servings, prep_time_minutes, cook_time_minutes,
    meal_types, ingredients, steps, diet_tags, notes, created_at, updated_at, deleted_at, schema_version
  FROM recipes WHERE id = ? AND deleted_at IS NULL`;
const SELECT_LIVE = `SELECT id, title, description, servings, prep_time_minutes, cook_time_minutes,
    meal_types, ingredients, steps, diet_tags, notes, created_at, updated_at, deleted_at, schema_version
  FROM recipes WHERE deleted_at IS NULL ORDER BY updated_at DESC, rowid`;
const SELECT_PENDING = `SELECT id, title, description, servings, prep_time_minutes, cook_time_minutes,
    meal_types, ingredients, steps, diet_tags, notes, created_at, updated_at, deleted_at, schema_version
  FROM recipes WHERE dirty = 1 AND (updated_at > ? OR (updated_at = ? AND id > ?))
  ORDER BY updated_at, id LIMIT ?`;
const COUNT_PENDING = "SELECT COUNT(*) AS count FROM recipes WHERE dirty = 1";
const INSERT_LOCAL = `INSERT INTO recipes (title, description, servings, prep_time_minutes, cook_time_minutes,
    meal_types, ingredients, steps, diet_tags, notes, id, created_at, updated_at, deleted_at, schema_version, dirty)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1)`;
// Only if the row is still the one that was read (same updated_at), so a download that
// landed in between is never overwritten by an edit made from the older copy.
const UPDATE_IF_UNCHANGED = `UPDATE recipes SET title = ?, description = ?, servings = ?, prep_time_minutes = ?,
    cook_time_minutes = ?, meal_types = ?, ingredients = ?, steps = ?, diet_tags = ?, notes = ?, updated_at = ?, dirty = 1
  WHERE id = ? AND deleted_at IS NULL AND updated_at = ?`;
const REMOVE_IF_UNCHANGED = `UPDATE recipes SET deleted_at = ?, updated_at = ?, dirty = 1
  WHERE id = ? AND deleted_at IS NULL AND updated_at = ?`;
// Only if nothing changed since the upload started.
const MARK_SYNCED = "UPDATE recipes SET dirty = 0 WHERE id = ? AND updated_at = ? AND dirty = 1";
// The same rule as incomingWins in records.ts, inside SQLite: a deleted copy replaces a
// live row however old it is, a live copy never replaces a deleted row, and otherwise the
// newer copy wins. Downloaded rows have nothing to upload (dirty = 0).
const UPSERT_IF_NEWER = `INSERT INTO recipes (title, description, servings, prep_time_minutes, cook_time_minutes,
    meal_types, ingredients, steps, diet_tags, notes, id, created_at, updated_at, deleted_at, schema_version, dirty)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    description = excluded.description,
    servings = excluded.servings,
    prep_time_minutes = excluded.prep_time_minutes,
    cook_time_minutes = excluded.cook_time_minutes,
    meal_types = excluded.meal_types,
    ingredients = excluded.ingredients,
    steps = excluded.steps,
    diet_tags = excluded.diet_tags,
    notes = excluded.notes,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at,
    schema_version = excluded.schema_version,
    dirty = 0
  WHERE (excluded.deleted_at IS NOT NULL AND recipes.deleted_at IS NULL)
    OR ((excluded.deleted_at IS NULL) = (recipes.deleted_at IS NULL) AND excluded.updated_at > recipes.updated_at)`;
const DELETE_ALL = "DELETE FROM recipes";

// The longest JSON text each list column can need, worked out from the recipe limits.
// JSON.stringify writes one character as at most 6 (a "\uXXXX" escape), and 200 per item
// is room for the keys, quotes, commas and numbers. Longer text is never parsed: the row
// reads as missing. About 100 KB for ingredients and 310 KB for steps.
const jsonCap = (maxItems: number, maxTextPerItem: number) => 2 + maxItems * (6 * maxTextPerItem + 200);
const MAX_INGREDIENTS_JSON = jsonCap(MAX_INGREDIENTS, 3 * MAX_INGREDIENT_FIELD_LENGTH);
const MAX_STEPS_JSON = jsonCap(MAX_STEPS, MAX_STEP_LENGTH);
const MAX_MEAL_TYPES_JSON = jsonCap(MEAL_TYPES.length, 0);
const MAX_DIET_TAGS_JSON = jsonCap(DIET_TAGS.length, 0);

// How many times an edit is tried when a download changes the row between reading and
// writing it. More than one retry in a row is very unlikely.
const MAX_EDIT_ATTEMPTS = 3;

// JSON from a column, or undefined if it is too long, not text, or not valid JSON.
function parseJson(text: unknown, maxLength: number): unknown {
  if (typeof text !== "string" || text.length > maxLength) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Rows read back are untrusted like any stored data: a row that fails validation reads
// as missing instead of reaching the screens or being uploaded.
function toRecord(row: RecipeRow | null): PendingRecord<StoredRecipe> | undefined {
  if (!row || !isRecordId(row.id)) return undefined;
  const result = storedRecipeSchema.safeParse(
    withoutUndefined({
      title: row.title,
      description: row.description ?? undefined,
      servings: row.servings,
      prepTimeMinutes: row.prep_time_minutes ?? undefined,
      cookTimeMinutes: row.cook_time_minutes ?? undefined,
      mealTypes: parseJson(row.meal_types, MAX_MEAL_TYPES_JSON),
      ingredients: parseJson(row.ingredients, MAX_INGREDIENTS_JSON),
      steps: parseJson(row.steps, MAX_STEPS_JSON),
      dietTags: parseJson(row.diet_tags, MAX_DIET_TAGS_JSON),
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? undefined,
      schemaVersion: row.schema_version,
    }),
  );
  return result.success ? { id: row.id, data: result.data } : undefined;
}

const toRecipe = ({ id, data }: PendingRecord<StoredRecipe>): Recipe => ({ ...data, id });

// Every valid row, skipping any that fail validation.
const validRecords = (rows: RecipeRow[]) =>
  rows.flatMap((row) => {
    const record = toRecord(row);
    return record ? [record] : [];
  });

// The recipe's own fields as column values, in the order the SQL above lists them.
const recipeColumns = (data: StoredRecipe): SqlValue[] => [
  data.title,
  data.description ?? null,
  data.servings,
  data.prepTimeMinutes ?? null,
  data.cookTimeMinutes ?? null,
  JSON.stringify(data.mealTypes),
  JSON.stringify(data.ingredients),
  JSON.stringify(data.steps),
  JSON.stringify(data.dietTags),
  data.notes ?? null,
];

// Recipes in the device's SQLite database: the offline-first source of truth (#1).
// Sync uploads changes later (last edit wins).
// "now" is the clock, so tests can control the timestamps.
export function createSqliteRecipeRepository(
  db: SqlDatabase,
  now: () => number = Date.now,
): RecipeRepository {
  // The screens to tell when something changes (see subscribe below).
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  // Reads one recipe that isn't deleted. An invalid ID never reaches the database.
  async function findLive(id: string): Promise<PendingRecord<StoredRecipe> | undefined> {
    if (!isRecordId(id)) return undefined;
    return toRecord(await db.getFirstAsync<RecipeRow>(SELECT_LIVE_BY_ID, [id]));
  }

  return {
    async create(input) {
      // The repository check is the one that counts: validate before every write.
      const result = recipeSchema.safeParse(input);
      if (!result.success) {
        return { ok: false, error: result.error };
      }

      // Save the cleaned data (result.data), plus the fields the repository sets.
      // The whole record is checked too (e.g. a phone clock set before 2020).
      const timestamp = now();
      const stored = storedRecipeSchema.safeParse({
        ...result.data,
        createdAt: timestamp,
        updatedAt: timestamp,
        schemaVersion: RECIPE_SCHEMA_VERSION,
      });
      if (!stored.success) {
        return { ok: false, error: stored.error };
      }

      const record = { id: newRecordId("recipe"), data: withoutUndefined(stored.data) };
      await db.runAsync(INSERT_LOCAL, [
        ...recipeColumns(record.data),
        record.id,
        record.data.createdAt,
        record.data.updatedAt,
        record.data.schemaVersion,
      ]);
      notify();
      return { ok: true, recipe: toRecipe(record) };
    },

    async update(id, input) {
      for (let attempt = 0; attempt < MAX_EDIT_ATTEMPTS; attempt += 1) {
        const existing = await findLive(id);
        if (!existing) {
          return { ok: false, reason: "not_found" };
        }
        const result = recipeSchema.safeParse(input);
        if (!result.success) {
          return { ok: false, reason: "invalid", error: result.error };
        }

        // A new updatedAt, so this edit wins over older copies when syncing.
        const stored = storedRecipeSchema.safeParse({
          ...result.data,
          createdAt: existing.data.createdAt,
          updatedAt: nextUpdatedAt(now, existing.data.updatedAt),
          schemaVersion: existing.data.schemaVersion,
        });
        if (!stored.success) {
          return { ok: false, reason: "invalid", error: stored.error };
        }

        const record = { id, data: withoutUndefined(stored.data) };
        const { changes } = await db.runAsync(UPDATE_IF_UNCHANGED, [
          ...recipeColumns(record.data),
          record.data.updatedAt,
          id,
          existing.data.updatedAt,
        ]);
        if (changes > 0) {
          notify();
          return { ok: true, recipe: toRecipe(record) };
        }
        // Nothing was written: the recipe was deleted or downloaded again since it was
        // read. Try again with the copy that is there now.
      }
      throw domainError("storage_failed");
    },

    async remove(id) {
      for (let attempt = 0; attempt < MAX_EDIT_ATTEMPTS; attempt += 1) {
        const existing = await findLive(id);
        if (!existing) return false;

        // Soft delete, so a later sync cannot bring the recipe back.
        const timestamp = nextUpdatedAt(now, existing.data.updatedAt);
        const stored = storedRecipeSchema.safeParse({ ...existing.data, deletedAt: timestamp, updatedAt: timestamp });
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

    // Leaves out deleted recipes and rows that fail validation; the most recently
    // changed come first.
    async list() {
      return validRecords(await db.getAllAsync<RecipeRow>(SELECT_LIVE, [])).map(toRecipe);
    },

    async getById(id) {
      const record = await findLive(id);
      return record ? toRecipe(record) : undefined;
    },

    // A row that fails validation is skipped: it can't be uploaded, so it stays pending.
    async listPending(limit, after) {
      if (!isPendingLimit(limit) || (after !== undefined && !isRecordCursor(after))) return [];
      return validRecords(await db.getAllAsync<RecipeRow>(SELECT_PENDING, [...pendingCursorParams(after), limit]));
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
      const result = storedRecipeSchema.safeParse(data);
      if (!result.success) return "invalid";

      // "changes" is how many rows SQLite wrote: 0 means the local copy was kept.
      const incoming = withoutUndefined(result.data);
      const { changes } = await db.runAsync(UPSERT_IF_NEWER, [
        ...recipeColumns(incoming),
        id,
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
