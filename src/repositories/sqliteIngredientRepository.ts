// The phone's copy of the ingredient catalog in SQLite (migration 6), N-08.
//
// replaceAll swaps a whole new copy in or changes nothing, without an SQL transaction.
// SqlDatabase has no transaction call, and expo-sqlite's withTransactionAsync isn't
// exclusive: another repository's write made at the same moment (a sync download, say)
// would run inside it and be undone by a rollback. Instead every row belongs to a
// generation, and reads only see the generation ingredient_meta names:
//   1. delete rows left over from an earlier attempt that failed (never the current copy)
//   2. insert the new copy as the next generation, in one statement (invisible to reads)
//   3. switch ingredient_meta to it, in one statement: this is the swap
//   4. delete the old generation (if this fails, the next replaceAll cleans up)
// Each statement is atomic on its own, so a failure at any step before 3 leaves the old
// copy exactly as it was.
import { domainError, withDomainErrors } from "@/services/domainErrors";
import type { SqlDatabase } from "@/storage/SqlDatabase";
import { timestampSchema } from "@/validation/authSchema";
import type { Ingredient } from "@/validation/ingredientSchema";
import { ingredientData, prepareReplacement, readStoredIngredient } from "./ingredientRecords";
import { MAX_INGREDIENTS, type IngredientCacheMeta, type IngredientRepository } from "./IngredientRepository";

// Constant SQL only (written out in full); every value is a "?" parameter. The meta keys
// are the fixed list 'generation', 'fetched_at' and 'count', never built from values.
const SELECT_META = "SELECT key, value FROM ingredient_meta";
// The current copy in one statement, so a read can't land between two steps of a swap.
// The generation must be stored as plain digits, or nothing is read.
const SELECT_CURRENT = `SELECT id, data FROM ingredients
  WHERE generation = (
    SELECT CAST(value AS INTEGER) FROM ingredient_meta
    WHERE key = 'generation' AND value GLOB '[1-9]*' AND value NOT GLOB '*[^0-9]*'
  )
  ORDER BY id LIMIT ?`;
const DELETE_OTHER_GENERATIONS = "DELETE FROM ingredients WHERE generation <> ?";
// Every row of the new copy at once: the second parameter is a JSON array of
// { id, data } objects, and data is the ingredient's JSON text.
const INSERT_GENERATION = `INSERT INTO ingredients (generation, id, data)
  SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.data') FROM json_each(?)`;
const SET_META = `INSERT INTO ingredient_meta (key, value)
  VALUES ('generation', ?), ('fetched_at', ?), ('count', ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
const DELETE_META = "DELETE FROM ingredient_meta";
const DELETE_ROWS = "DELETE FROM ingredients";

// Meta values are text. Plain digits only, then range-checked; anything else is missing.
function readWholeNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "string" || !/^[0-9]{1,16}$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

type StoredMeta = { generation: number | null; fetchedAt: number | null; count: number | null };

export function createSqliteIngredientRepository(db: SqlDatabase): IngredientRepository {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  // replaceAll and clear run one at a time, so two swaps can never mix their steps.
  let queue: Promise<unknown> = Promise.resolve();
  function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  // ingredient_meta, read back like any stored data: invalid values read as missing.
  async function readMeta(): Promise<StoredMeta> {
    const rows = await db.getAllAsync<{ key: unknown; value: unknown }>(SELECT_META, []);
    const values = new Map(rows.map((row) => [row.key, row.value]));
    const fetchedAt = readWholeNumber(values.get("fetched_at"), 0, Number.MAX_SAFE_INTEGER);
    return {
      generation: readWholeNumber(values.get("generation"), 1, Number.MAX_SAFE_INTEGER - 1),
      fetchedAt: timestampSchema.safeParse(fetchedAt).success ? fetchedAt : null,
      count: readWholeNumber(values.get("count"), 1, MAX_INGREDIENTS),
    };
  }

  return {
    async replaceAll(ingredients, fetchedAt) {
      // Throws invalid_input before anything is touched.
      const { rows, fetchedAt: time } = prepareReplacement(ingredients, fetchedAt);
      await oneAtATime(() =>
        withDomainErrors(async () => {
          const current = (await readMeta()).generation ?? 0;
          const next = current + 1;
          await db.runAsync(DELETE_OTHER_GENERATIONS, [current]);
          const payload = JSON.stringify(rows.map((row) => ({ id: row.id, data: ingredientData(row) })));
          const { changes } = await db.runAsync(INSERT_GENERATION, [next, payload]);
          if (changes !== rows.length) throw domainError("storage_failed");
          await db.runAsync(SET_META, [String(next), String(time), String(rows.length)]);
          // The new copy is in place. Removing the old one can fail without harm.
          await db.runAsync(DELETE_OTHER_GENERATIONS, [next]).catch(() => undefined);
        }, "storage_failed"),
      );
      notify();
    },

    list: () =>
      withDomainErrors(async (): Promise<Ingredient[]> => {
        const rows = await db.getAllAsync<{ id: unknown; data: unknown }>(SELECT_CURRENT, [MAX_INGREDIENTS]);
        return rows.flatMap((row) => {
          const ingredient = readStoredIngredient(row.id, row.data);
          return ingredient ? [ingredient] : [];
        });
      }, "storage_failed"),

    meta: () =>
      withDomainErrors(async (): Promise<IngredientCacheMeta | null> => {
        const { generation, fetchedAt, count } = await readMeta();
        return generation !== null && fetchedAt !== null && count !== null ? { fetchedAt, count } : null;
      }, "storage_failed"),

    async clear() {
      // The meta first: once it's gone, no rows are current, even if deleting them fails.
      await oneAtATime(() =>
        withDomainErrors(async () => {
          await db.runAsync(DELETE_META, []);
          await db.runAsync(DELETE_ROWS, []);
        }, "storage_failed"),
      );
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
