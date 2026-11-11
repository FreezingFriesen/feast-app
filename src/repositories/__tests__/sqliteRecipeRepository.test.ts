import { runMigrations } from "@/storage/migrations";
import {
  describeRecipeRepositoryContract,
  expectCreated,
  INCOMING_ID,
  INCOMING_RECIPE,
  RECIPE_INPUT,
  T0,
} from "@/testing/contracts/recipeRepositoryContract";
import { createNodeSqliteDatabase } from "@/testing/nodeSqliteDatabase";
import { runBeforeWrite } from "@/testing/runBeforeWrite";
import { createSqliteRecipeRepository } from "../sqliteRecipeRepository";

type TestDatabase = ReturnType<typeof createNodeSqliteDatabase>;

async function openDatabase() {
  const db = createNodeSqliteDatabase();
  await runMigrations(db);
  return db;
}

async function setup(now: () => number = () => T0 + 1_000) {
  const db = await openDatabase();
  return { db, repo: createSqliteRecipeRepository(db, now) };
}

const rowCount = (db: TestDatabase) =>
  (db.raw.prepare("SELECT COUNT(*) AS count FROM recipes").get() as { count: number }).count;
const tableExists = (db: TestDatabase, name: string) =>
  db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
const dirtyColumn = (db: TestDatabase, id: string) =>
  (db.raw.prepare("SELECT dirty FROM recipes WHERE id = ?").get(id) as { dirty: number }).dirty;

describeRecipeRepositoryContract("SQLite", async (now) => (await setup(now)).repo);

describe("SQLite recipe repository", () => {
  describe("values are never put into the SQL text", () => {
    it.each([
      "'; DROP TABLE recipes;--",
      "x'); DROP TABLE recipes;--",
      "1 OR 1=1",
      '" OR ""="',
      "<script>alert(1)</script>",
    ])("treats %p as data: nothing runs and the tables still exist", async (attack) => {
      const { db, repo } = await setup();
      await repo.mergeIncoming(INCOMING_ID, INCOMING_RECIPE);

      expect(await repo.getById(attack)).toBeUndefined();
      expect(await repo.update(attack, RECIPE_INPUT)).toEqual({ ok: false, reason: "not_found" });
      expect(await repo.remove(attack)).toBe(false);
      expect(await repo.markSynced(attack, T0)).toBe(false);
      expect(await repo.mergeIncoming(attack, INCOMING_RECIPE)).toBe("invalid");
      expect(await repo.create({ ...RECIPE_INPUT, title: attack })).toMatchObject({ ok: false });

      // Free text keeps the attack, stored as plain text.
      const saved = expectCreated(
        await repo.create({
          ...RECIPE_INPUT,
          description: attack,
          steps: [attack],
          notes: attack,
          ingredients: [{ name: "Flour", quantity: 1, unit: "g", note: attack }],
        }),
      );

      expect(["profiles", "recipes", "meal_plan_entries"].every((name) => tableExists(db, name))).toBe(true);
      expect(rowCount(db)).toBe(2);
      expect(await repo.getById(INCOMING_ID)).toEqual({ ...INCOMING_RECIPE, id: INCOMING_ID });
      expect(await repo.getById(saved.id)).toEqual(saved);
      const row = db.raw.prepare("SELECT description, notes, steps FROM recipes WHERE id = ?").get(saved.id) as {
        description: string;
        notes: string;
        steps: string;
      };
      expect(row.description).toBe(attack);
      expect(row.notes).toBe(attack);
      expect(JSON.parse(row.steps)).toEqual([attack]);
    });

    it("stores a title with quotes and SQL words exactly as typed", async () => {
      const { db, repo } = await setup();
      const title = "Robert') OR ('1' - DROP TABLE recipes";
      const saved = expectCreated(await repo.create({ ...RECIPE_INPUT, title }));
      expect(saved.title).toBe(title);
      expect((await repo.getById(saved.id))?.title).toBe(title);
      expect(tableExists(db, "recipes")).toBe(true);
    });
  });

  describe("rows read back are untrusted", () => {
    it.each([
      ["bad JSON", "UPDATE recipes SET steps = '[not json' WHERE id = ?"],
      ["JSON null for a list", "UPDATE recipes SET ingredients = 'null' WHERE id = ?"],
      ["an out-of-range value", "UPDATE recipes SET servings = 101 WHERE id = ?"],
      ["an unknown meal type", `UPDATE recipes SET meal_types = '["brunch"]' WHERE id = ?`],
      ["duplicate tags", `UPDATE recipes SET diet_tags = '["vegan","vegan"]' WHERE id = ?`],
      ["an unsafe ingredient name", `UPDATE recipes SET ingredients = '[{"name":"<b>x</b>","quantity":1,"unit":"g"}]' WHERE id = ?`],
      ["a text timestamp", "UPDATE recipes SET created_at = 'yesterday' WHERE id = ?"],
      ["updated_at before created_at", "UPDATE recipes SET updated_at = created_at - 1 WHERE id = ?"],
      ["an unknown schema version", "UPDATE recipes SET schema_version = 2 WHERE id = ?"],
      ["a bad id", "UPDATE recipes SET id = 'Bad ID' WHERE id = ?"],
    ])("a row with %s reads as missing and is skipped by every list", async (_label, tamper) => {
      const { db, repo } = await setup();
      await repo.mergeIncoming(INCOMING_ID, INCOMING_RECIPE);
      const good = expectCreated(await repo.create(RECIPE_INPUT));
      db.raw.prepare("UPDATE recipes SET dirty = 1 WHERE id = ?").run(INCOMING_ID);
      db.raw.prepare(tamper).run(INCOMING_ID);

      expect(await repo.getById(INCOMING_ID)).toBeUndefined();
      expect(await repo.list()).toEqual([good]);
      expect((await repo.listPending(10)).map((record) => record.id)).toEqual([good.id]);
      // Can't be edited either: it reads as missing.
      expect(await repo.update(INCOMING_ID, RECIPE_INPUT)).toEqual({ ok: false, reason: "not_found" });
    });

    it("never parses JSON longer than the column can need", async () => {
      const { db, repo } = await setup();
      await repo.mergeIncoming(INCOMING_ID, INCOMING_RECIPE);
      const huge = JSON.stringify(["a".repeat(400_000)]);
      db.raw.prepare("UPDATE recipes SET steps = ? WHERE id = ?").run(huge, INCOMING_ID);

      const parse = jest.spyOn(JSON, "parse");
      try {
        expect(await repo.getById(INCOMING_ID)).toBeUndefined();
        expect(await repo.list()).toEqual([]);
        expect(parse).not.toHaveBeenCalledWith(huge);
      } finally {
        parse.mockRestore();
      }
    });

    it("the largest valid recipe still fits under the JSON caps", async () => {
      const { repo } = await setup();
      // A lone surrogate is one character that JSON.stringify writes as 6 ("\ud800").
      const worst = (length: number) => "\uD800".repeat(length);
      const saved = expectCreated(
        await repo.create({
          ...RECIPE_INPUT,
          mealTypes: ["breakfast", "lunch", "dinner", "snack"],
          dietTags: ["vegan", "vegetarian", "pescatarian", "keto_friendly", "gluten_free", "dairy_free"],
          ingredients: Array.from({ length: 50 }, () => ({
            ingredientId: worst(100),
            name: "a".repeat(100),
            quantity: 99999.99999999999,
            unit: "piece",
            note: worst(100),
          })),
          steps: Array.from({ length: 50 }, () => worst(1000)),
        }),
      );
      expect(await repo.getById(saved.id)).toEqual(saved);
    });
  });

  it("restart: a new repository on the same database sees everything, deleted and pending state included", async () => {
    const { db, repo } = await setup();
    const kept = expectCreated(await repo.create({ ...RECIPE_INPUT, title: "Kept" }));
    const removed = expectCreated(await repo.create({ ...RECIPE_INPUT, title: "Removed" }));
    await repo.remove(removed.id);
    await repo.mergeIncoming(INCOMING_ID, INCOMING_RECIPE);
    const before = { list: await repo.list(), pending: await repo.listPending(10) };

    // The app runs the migrations on every start.
    await runMigrations(db);
    const restarted = createSqliteRecipeRepository(db, () => T0 + 2_000);

    expect(await restarted.list()).toEqual(before.list);
    expect(await restarted.getById(kept.id)).toEqual(kept);
    expect(await restarted.getById(INCOMING_ID)).toEqual({ ...INCOMING_RECIPE, id: INCOMING_ID });
    expect(await restarted.getById(removed.id)).toBeUndefined();
    expect(await restarted.listPending(10)).toEqual(before.pending);
    expect(await restarted.pendingCount()).toBe(2);
    // Still deleted after the restart: a download can't bring it back.
    expect(
      await restarted.mergeIncoming(removed.id, { ...INCOMING_RECIPE, updatedAt: T0 + 90_000 }),
    ).toBe("kept_local");
  });

  it("stores dirty = 1 after local writes and 0 after uploads and downloads", async () => {
    const { db, repo } = await setup();
    const recipe = expectCreated(await repo.create(RECIPE_INPUT));
    expect(dirtyColumn(db, recipe.id)).toBe(1);
    await repo.markSynced(recipe.id, recipe.updatedAt);
    expect(dirtyColumn(db, recipe.id)).toBe(0);
    await repo.update(recipe.id, RECIPE_INPUT);
    expect(dirtyColumn(db, recipe.id)).toBe(1);

    await repo.mergeIncoming(INCOMING_ID, INCOMING_RECIPE);
    expect(dirtyColumn(db, INCOMING_ID)).toBe(0);
    await repo.remove(INCOMING_ID);
    expect(dirtyColumn(db, INCOMING_ID)).toBe(1);
  });

  describe("a download that lands between an edit's read and its write", () => {
    // `sync` stands in for the sync engine; `phone` is the repository under test, whose
    // writes run the download first.
    async function setupRace(prefix: string, download: unknown, times = 1) {
      const db = await openDatabase();
      const sync = createSqliteRecipeRepository(db, () => T0);
      await sync.mergeIncoming(INCOMING_ID, INCOMING_RECIPE);
      const racing = runBeforeWrite(db, prefix, () => sync.mergeIncoming(INCOMING_ID, download), times);
      return { sync, phone: createSqliteRecipeRepository(racing, () => T0 + 1_000) };
    }

    it("is not overwritten by an edit made from the older copy; the edit gets a later updatedAt", async () => {
      const remote = { ...INCOMING_RECIPE, title: "Remote", updatedAt: T0 + 50_000 };
      const { phone } = await setupRace("UPDATE recipes SET title", remote);

      const result = await phone.update(INCOMING_ID, { ...RECIPE_INPUT, title: "Local" });
      expect(result).toMatchObject({ ok: true, recipe: { title: "Local", updatedAt: T0 + 50_001 } });
      expect(await phone.getById(INCOMING_ID)).toMatchObject({ title: "Local", updatedAt: T0 + 50_001 });
      expect(await phone.pendingCount()).toBe(1);
    });

    it("a remove still wins with a later updatedAt", async () => {
      const remote = { ...INCOMING_RECIPE, title: "Remote", updatedAt: T0 + 50_000 };
      const { phone } = await setupRace("UPDATE recipes SET deleted_at", remote);

      expect(await phone.remove(INCOMING_ID)).toBe(true);
      const [tombstone] = await phone.listPending(10);
      expect(tombstone.data).toMatchObject({ title: "Remote", updatedAt: T0 + 50_001, deletedAt: T0 + 50_001 });
    });

    it("an edit to a recipe that the download deleted is not_found", async () => {
      const deleted = { ...INCOMING_RECIPE, updatedAt: T0 + 50_000, deletedAt: T0 + 50_000 };
      const { phone } = await setupRace("UPDATE recipes SET title", deleted);
      expect(await phone.update(INCOMING_ID, RECIPE_INPUT)).toEqual({ ok: false, reason: "not_found" });
      expect(await phone.getById(INCOMING_ID)).toBeUndefined();
    });

    it("gives up with storage_failed if the recipe keeps changing", async () => {
      const db = await openDatabase();
      const sync = createSqliteRecipeRepository(db, () => T0);
      await sync.mergeIncoming(INCOMING_ID, INCOMING_RECIPE);
      let version = T0;
      const racing = runBeforeWrite(
        db,
        "UPDATE recipes SET title",
        () => sync.mergeIncoming(INCOMING_ID, { ...INCOMING_RECIPE, updatedAt: (version += 1_000) }),
        Infinity,
      );
      const phone = createSqliteRecipeRepository(racing, () => T0 + 1);
      await expect(phone.update(INCOMING_ID, RECIPE_INPUT)).rejects.toMatchObject({
        name: "DomainError",
        code: "storage_failed",
      });
    });
  });
});
