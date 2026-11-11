import { runMigrations } from "@/storage/migrations";
import {
  describeMealPlanRepositoryContract,
  ENTRY_INPUT,
  expectOk,
  INCOMING_ENTRY,
  INCOMING_ID,
  T0,
} from "@/testing/contracts/mealPlanRepositoryContract";
import { createNodeSqliteDatabase } from "@/testing/nodeSqliteDatabase";
import { runBeforeWrite } from "@/testing/runBeforeWrite";
import { MAX_ENTRIES_PER_SLOT } from "@/validation/mealPlanSchema";
import { createSqliteMealPlanRepository } from "../sqliteMealPlanRepository";

type TestDatabase = ReturnType<typeof createNodeSqliteDatabase>;

async function openDatabase() {
  const db = createNodeSqliteDatabase();
  await runMigrations(db);
  return db;
}

async function setup(now: () => number = () => T0 + 1_000) {
  const db = await openDatabase();
  return { db, repo: createSqliteMealPlanRepository(db, now) };
}

const rowCount = (db: TestDatabase) =>
  (db.raw.prepare("SELECT COUNT(*) AS count FROM meal_plan_entries").get() as { count: number }).count;
const tableExists = (db: TestDatabase, name: string) =>
  db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
const dirtyColumn = (db: TestDatabase, id: string) =>
  (db.raw.prepare("SELECT dirty FROM meal_plan_entries WHERE id = ?").get(id) as { dirty: number }).dirty;
const everything = (repo: ReturnType<typeof createSqliteMealPlanRepository>) =>
  repo.listBetween("2000-01-01", "2100-12-31");

describeMealPlanRepositoryContract("SQLite", async (now) => (await setup(now)).repo);

describe("SQLite meal plan repository", () => {
  it.each([
    "'; DROP TABLE meal_plan_entries;--",
    "x'); DROP TABLE meal_plan_entries;--",
    "1 OR 1=1",
    "2026-10-19' OR '1'='1",
    "<script>alert(1)</script>",
  ])("treats %p as data: nothing runs and the tables still exist", async (attack) => {
    const { db, repo } = await setup();
    await repo.mergeIncoming(INCOMING_ID, INCOMING_ENTRY);

    expect(await repo.getById(attack)).toBeUndefined();
    expect(await repo.update(attack, { servings: 2 })).toEqual({ ok: false, reason: "not_found" });
    expect(await repo.update(INCOMING_ID, { date: attack })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await repo.remove(attack)).toBe(false);
    expect(await repo.markSynced(attack, T0)).toBe(false);
    expect(await repo.mergeIncoming(attack, INCOMING_ENTRY)).toBe("invalid");
    expect(await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_ENTRY, recipeId: attack, updatedAt: T0 + 5 })).toBe(
      "invalid",
    );
    expect(await repo.add({ ...ENTRY_INPUT, recipeId: attack })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await repo.listBetween(attack, "2100-12-31")).toEqual([]);
    expect(await repo.listBetween("2000-01-01", attack)).toEqual([]);

    expect(["profiles", "recipes", "meal_plan_entries"].every((name) => tableExists(db, name))).toBe(true);
    expect(rowCount(db)).toBe(1);
    expect(await repo.getById(INCOMING_ID)).toEqual({ ...INCOMING_ENTRY, id: INCOMING_ID });
  });

  it.each([
    ["a date that doesn't exist", "UPDATE meal_plan_entries SET date = '2026-02-30' WHERE id = ?"],
    ["a meal type that isn't a slot", "UPDATE meal_plan_entries SET meal_type = 'snack' WHERE id = ?"],
    ["an out-of-range value", "UPDATE meal_plan_entries SET servings = 0 WHERE id = ?"],
    ["an unsafe recipe id", "UPDATE meal_plan_entries SET recipe_id = '../other' WHERE id = ?"],
    ["a text timestamp", "UPDATE meal_plan_entries SET updated_at = 'later' WHERE id = ?"],
    ["updated_at before created_at", "UPDATE meal_plan_entries SET updated_at = created_at - 1 WHERE id = ?"],
    ["an unknown schema version", "UPDATE meal_plan_entries SET schema_version = 2 WHERE id = ?"],
    ["a bad id", "UPDATE meal_plan_entries SET id = 'Bad ID' WHERE id = ?"],
  ])("a row with %s reads as missing and is skipped by every list", async (_label, tamper) => {
    const { db, repo } = await setup();
    await repo.mergeIncoming(INCOMING_ID, INCOMING_ENTRY);
    const good = expectOk(await repo.add(ENTRY_INPUT));
    db.raw.prepare("UPDATE meal_plan_entries SET dirty = 1 WHERE id = ?").run(INCOMING_ID);
    db.raw.prepare(tamper).run(INCOMING_ID);

    expect(await repo.getById(INCOMING_ID)).toBeUndefined();
    expect(await everything(repo)).toEqual([good]);
    expect((await repo.listPending(10)).map((record) => record.id)).toEqual([good.id]);
    expect(await repo.update(INCOMING_ID, { servings: 2 })).toEqual({ ok: false, reason: "not_found" });
  });

  it("restart: a new repository on the same database sees everything, removed and pending state included", async () => {
    const { db, repo } = await setup();
    const kept = expectOk(await repo.add(ENTRY_INPUT));
    const removed = expectOk(await repo.add({ ...ENTRY_INPUT, mealType: "lunch" }));
    await repo.remove(removed.id);
    await repo.mergeIncoming(INCOMING_ID, INCOMING_ENTRY);
    const before = { entries: await everything(repo), pending: await repo.listPending(10) };

    // The app runs the migrations on every start.
    await runMigrations(db);
    const restarted = createSqliteMealPlanRepository(db, () => T0 + 2_000);

    expect(await everything(restarted)).toEqual(before.entries);
    expect(await restarted.getById(kept.id)).toEqual(kept);
    expect(await restarted.getById(removed.id)).toBeUndefined();
    expect(await restarted.listPending(10)).toEqual(before.pending);
    expect(await restarted.pendingCount()).toBe(2);
    expect(
      await restarted.mergeIncoming(removed.id, { ...INCOMING_ENTRY, updatedAt: T0 + 90_000 }),
    ).toBe("kept_local");
  });

  it("stores dirty = 1 after local writes and 0 after uploads and downloads", async () => {
    const { db, repo } = await setup();
    const entry = expectOk(await repo.add(ENTRY_INPUT));
    expect(dirtyColumn(db, entry.id)).toBe(1);
    await repo.markSynced(entry.id, entry.updatedAt);
    expect(dirtyColumn(db, entry.id)).toBe(0);
    await repo.update(entry.id, { servings: 2 });
    expect(dirtyColumn(db, entry.id)).toBe(1);

    await repo.mergeIncoming(INCOMING_ID, INCOMING_ENTRY);
    expect(dirtyColumn(db, INCOMING_ID)).toBe(0);
    await repo.remove(INCOMING_ID);
    expect(dirtyColumn(db, INCOMING_ID)).toBe(1);
  });

  describe("something that lands between an update's read and its write", () => {
    // `other` stands in for the sync engine or a second screen; `phone` is the
    // repository under test, whose update runs `hook` first.
    async function setupRace(hook: (other: ReturnType<typeof createSqliteMealPlanRepository>) => Promise<unknown>) {
      const db = await openDatabase();
      const other = createSqliteMealPlanRepository(db, () => T0 + 500);
      await other.mergeIncoming(INCOMING_ID, INCOMING_ENTRY);
      const racing = runBeforeWrite(db, "UPDATE meal_plan_entries SET date", () => hook(other));
      return { other, phone: createSqliteMealPlanRepository(racing, () => T0 + 1_000) };
    }

    it("a download isn't overwritten by an edit made from the older copy; the edit gets a later updatedAt", async () => {
      const { phone } = await setupRace((other) =>
        other.mergeIncoming(INCOMING_ID, { ...INCOMING_ENTRY, servings: 9, updatedAt: T0 + 50_000 }),
      );
      expect(await phone.update(INCOMING_ID, { date: "2026-10-21" })).toMatchObject({
        ok: true,
        entry: { date: "2026-10-21", servings: 9, updatedAt: T0 + 50_001 },
      });
    });

    it("an entry removed in between is not_found", async () => {
      const { phone } = await setupRace((other) => other.remove(INCOMING_ID));
      expect(await phone.update(INCOMING_ID, { servings: 2 })).toEqual({ ok: false, reason: "not_found" });
      expect(await phone.getById(INCOMING_ID)).toBeUndefined();
    });

    it("a slot that fills up in between is slot_full, never over the limit", async () => {
      const { other, phone } = await setupRace((sameDb) => sameDb.add({ ...ENTRY_INPUT, mealType: "lunch" }));
      for (let i = 1; i < MAX_ENTRIES_PER_SLOT; i += 1) {
        expectOk(await other.add({ ...ENTRY_INPUT, mealType: "lunch" }));
      }
      expect(await phone.update(INCOMING_ID, { mealType: "lunch" })).toEqual({ ok: false, reason: "slot_full" });
      const lunch = (await everything(phone)).filter((entry) => entry.mealType === "lunch");
      expect(lunch).toHaveLength(MAX_ENTRIES_PER_SLOT);
      expect((await phone.getById(INCOMING_ID))?.mealType).toBe("dinner");
    });
  });
});
