import { runMigrations } from "@/storage/migrations";
import type { SqlDatabase } from "@/storage/SqlDatabase";
import {
  describeIngredientRepositoryContract,
  EGG,
  FETCHED_AT,
  FLOUR,
  LATER,
  MILK,
} from "@/testing/contracts/ingredientRepositoryContract";
import { createNodeSqliteDatabase } from "@/testing/nodeSqliteDatabase";
import { createSqliteIngredientRepository } from "../sqliteIngredientRepository";

type TestDatabase = ReturnType<typeof createNodeSqliteDatabase>;

async function setup(db: TestDatabase = createNodeSqliteDatabase()) {
  await runMigrations(db);
  return { db, repo: createSqliteIngredientRepository(db) };
}

describeIngredientRepositoryContract("SQLite", async () => (await setup()).repo);

// The same database, except that the `failAt`-th write (counting from 1) throws.
function failingWrite(db: SqlDatabase, failAt: number): SqlDatabase {
  let writes = 0;
  return {
    execAsync: (source) => db.execAsync(source),
    getFirstAsync: (source, params) => db.getFirstAsync(source, params),
    getAllAsync: (source, params) => db.getAllAsync(source, params),
    async runAsync(source, params) {
      writes += 1;
      if (writes === failAt) throw new Error("disk I/O error");
      return db.runAsync(source, params);
    },
  };
}

const rowCount = (db: TestDatabase) => (db.raw.prepare("SELECT COUNT(*) AS count FROM ingredients").get() as { count: number }).count;
const tables = (db: TestDatabase) =>
  (db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map(
    (row) => row.name,
  );

describe("SQLite ingredient repository", () => {
  it("keeps the copy after a restart (a new repository on the same database)", async () => {
    const { db, repo } = await setup();
    await repo.replaceAll([FLOUR, EGG], FETCHED_AT);
    const restarted = createSqliteIngredientRepository(db);
    expect(await restarted.list()).toEqual([FLOUR, EGG]);
    expect(await restarted.meta()).toEqual({ fetchedAt: FETCHED_AT, count: 2 });
  });

  it("deletes the old copy's rows once the new one is in place", async () => {
    const { db, repo } = await setup();
    await repo.replaceAll([FLOUR, EGG], FETCHED_AT);
    await repo.replaceAll([MILK], LATER);
    expect(rowCount(db)).toBe(1);
  });

  // replaceAll makes four writes: delete leftovers, insert the new copy, switch the meta,
  // delete the old copy. A failure at any of the first three leaves the old copy whole; a
  // failure at the last one still leaves the new copy whole. Never a mix.
  it.each([
    [1, "deleting leftovers", "old"],
    [2, "inserting the new copy", "old"],
    [3, "switching to the new copy", "old"],
    [4, "deleting the old copy", "new"],
  ] as const)("a failure at write %d (%s) leaves the %s copy, whole", async (failAt, _step, expected) => {
    const { db, repo } = await setup();
    await repo.replaceAll([FLOUR, EGG], FETCHED_AT);
    const failing = createSqliteIngredientRepository(failingWrite(db, failAt));
    const listener = jest.fn();
    failing.subscribe(listener);

    const replaced = failing.replaceAll([MILK], LATER);
    if (expected === "old") {
      await expect(replaced).rejects.toMatchObject({ name: "DomainError", code: "storage_failed" });
      expect(await repo.list()).toEqual([FLOUR, EGG]);
      expect(await repo.meta()).toEqual({ fetchedAt: FETCHED_AT, count: 2 });
      expect(listener).not.toHaveBeenCalled();
    } else {
      await replaced;
      expect(await repo.list()).toEqual([MILK]);
      expect(await repo.meta()).toEqual({ fetchedAt: LATER, count: 1 });
    }

    // Whatever was left behind, the next replacement cleans up and works.
    await repo.replaceAll([EGG, MILK], LATER + 1);
    expect(await repo.list()).toEqual([EGG, MILK]);
    expect(rowCount(db)).toBe(2);
  });

  describe("reads a tampered database safely", () => {
    it.each([
      ["broken JSON", "data = '{not json'"],
      ["JSON that isn't an object", "data = '[1,2,3]'"],
      ["text over the length limit", `data = '"${"a".repeat(8001)}"'`],
      ["a value the schema refuses", `data = json_set(data, '$.allergens', json('["gluten"]'))`],
      ["an attack name", `data = json_set(data, '$.name', '<script>alert(1)</script>')`],
      ["an ID that isn't safe in a path", "id = '../x'"],
      ["an ID with capitals", "id = 'ALL_PURPOSE_FLOUR'"],
    ])("a row with %s reads as missing", async (_label, change) => {
      const { db, repo } = await setup();
      await repo.replaceAll([FLOUR, EGG], FETCHED_AT);
      // Test-only SQL against the raw database, standing in for someone editing the file.
      db.raw.exec(`UPDATE ingredients SET ${change} WHERE id = 'all_purpose_flour'`);
      expect(await repo.list()).toEqual([EGG]);
    });

    it("stored data can't claim a different ID", async () => {
      const { db, repo } = await setup();
      await repo.replaceAll([FLOUR], FETCHED_AT);
      db.raw.exec(`UPDATE ingredients SET data = json_set(data, '$.id', 'egg_whole_raw')`);
      expect((await repo.list()).map((ingredient) => ingredient.id)).toEqual(["all_purpose_flour"]);
    });

    it.each(["x", "1abc", "0", "-1", "1.5", ""])("a generation of %p means there is no copy", async (generation) => {
      const { db, repo } = await setup();
      await repo.replaceAll([FLOUR, EGG], FETCHED_AT);
      db.raw.prepare("UPDATE ingredient_meta SET value = ? WHERE key = 'generation'").run(generation);
      expect(await repo.list()).toEqual([]);
      expect(await repo.meta()).toBeNull();
      // A new download replaces it cleanly.
      await repo.replaceAll([MILK], LATER);
      expect(await repo.list()).toEqual([MILK]);
      expect(rowCount(db)).toBe(1);
    });

    it.each([
      ["fetched_at", "soon"],
      ["fetched_at", "99999999999999999"],
      ["count", "0"],
      ["count", "2001"],
    ])("a %s of %p reads as no copy, so it gets downloaded again", async (key, value) => {
      const { db, repo } = await setup();
      await repo.replaceAll([FLOUR, EGG], FETCHED_AT);
      db.raw.prepare("UPDATE ingredient_meta SET value = ? WHERE key = ?").run(value, key);
      expect(await repo.meta()).toBeNull();
    });
  });

  it("refuses an attack name, keeps attack notes as plain text, and the tables are still there", async () => {
    const { db, repo } = await setup();
    await expect(
      repo.replaceAll([{ ...FLOUR, name: "'; DROP TABLE ingredients;--" }], FETCHED_AT),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await repo.replaceAll([{ ...FLOUR, notes: "'); DROP TABLE ingredient_meta;--" }], FETCHED_AT);
    expect(tables(db)).toEqual(expect.arrayContaining(["ingredient_meta", "ingredients"]));
    expect((await repo.list())[0].notes).toBe("'); DROP TABLE ingredient_meta;--");
  });
});
