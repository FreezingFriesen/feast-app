import { runMigrations } from "@/storage/migrations";
import {
  describeGroceryRepositoryContract,
  expectAdded,
  ITEM_INPUT,
  KEY,
  T0,
  WEEK,
} from "@/testing/contracts/groceryRepositoryContract";
import { createNodeSqliteDatabase } from "@/testing/nodeSqliteDatabase";
import type { GroceryLimits } from "../GroceryRepository";
import { createSqliteGroceryRepository } from "../sqliteGroceryRepository";

type TestDatabase = ReturnType<typeof createNodeSqliteDatabase>;

async function setup(now: () => number = () => T0 + 1_000, limits?: GroceryLimits) {
  const db = createNodeSqliteDatabase();
  await runMigrations(db);
  return { db, repo: createSqliteGroceryRepository(db, now, limits) };
}

const TABLES = ["profiles", "recipes", "meal_plan_entries", "sync_meta", "grocery_checks", "grocery_manual_items"];
const tableExists = (db: TestDatabase, name: string) =>
  db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
const count = (db: TestDatabase, table: "grocery_checks" | "grocery_manual_items") =>
  (
    db.raw
      .prepare(table === "grocery_checks" ? "SELECT COUNT(*) AS n FROM grocery_checks" : "SELECT COUNT(*) AS n FROM grocery_manual_items")
      .get() as { n: number }
  ).n;

describeGroceryRepositoryContract("SQLite", async (now, limits) => (await setup(now, limits)).repo);

describe("SQLite grocery repository", () => {
  it.each([
    "'; DROP TABLE grocery_checks;--",
    "x'); DROP TABLE grocery_manual_items;--",
    "1 OR 1=1",
    "2026-11-09' OR '1'='1",
    "<script>alert(1)</script>",
  ])("treats %p as data: nothing runs and the tables still exist", async (attack) => {
    const { db, repo } = await setup();
    await repo.setChecked(WEEK, KEY, true);
    const item = expectAdded(await repo.addManualItem(WEEK, ITEM_INPUT));

    expect(await repo.listCheckedKeys(attack)).toEqual([]);
    expect(await repo.listManualItems(attack)).toEqual([]);
    expect(await repo.setChecked(attack, KEY, true)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await repo.addManualItem(attack, ITEM_INPUT)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await repo.addManualItem(WEEK, { name: attack })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await repo.setManualItemChecked(attack, true)).toBe(false);
    expect(await repo.removeManualItem(attack)).toBe(false);
    // As a key it is stored, as plain text.
    expect(await repo.setChecked(WEEK, attack, true)).toEqual({ ok: true });

    expect(TABLES.every((name) => tableExists(db, name))).toBe(true);
    expect(await repo.listCheckedKeys(WEEK)).toEqual([attack, KEY].sort());
    expect(await repo.listManualItems(WEEK)).toEqual([item]);
  });

  it.each([
    ["a key with a control character", "UPDATE grocery_checks SET item_key = 'name:flour' || char(0) || '|mass'"],
    ["a key with spaces around it", "UPDATE grocery_checks SET item_key = ' name:flour|mass '"],
    ["a key that is too long", "UPDATE grocery_checks SET item_key = printf('%.300c', 'k')"],
    ["an empty key", "UPDATE grocery_checks SET item_key = ''"],
    ["a key with a hidden zero-width space", "UPDATE grocery_checks SET item_key = 'name:flour' || char(8203) || '|mass'"],
  ])("a check row with %s reads as missing", async (_label, tamper) => {
    const { db, repo } = await setup();
    await repo.setChecked(WEEK, KEY, true);
    db.raw.exec(tamper);
    expect(await repo.listCheckedKeys(WEEK)).toEqual([]);
  });

  it("a check row in a week that isn't a Monday is never read", async () => {
    const { db, repo } = await setup();
    db.raw.prepare("INSERT INTO grocery_checks (week_start, item_key) VALUES ('2026-11-10', ?)").run(KEY);
    expect(await repo.listCheckedKeys("2026-11-10")).toEqual([]);
  });

  it.each([
    ["a week that isn't a Monday", "UPDATE grocery_manual_items SET week_start = '2026-11-10'"],
    ["a name outside the allowlist", "UPDATE grocery_manual_items SET name = '<script>alert(1)</script>'"],
    ["an empty name", "UPDATE grocery_manual_items SET name = ''"],
    ["a negative quantity", "UPDATE grocery_manual_items SET quantity = -1"],
    ["a quantity over the limit", "UPDATE grocery_manual_items SET quantity = 100001"],
    ["an unknown unit", "UPDATE grocery_manual_items SET unit = 'cups'"],
    ["a quantity without a unit", "UPDATE grocery_manual_items SET unit = NULL"],
    ["a checked value that isn't 0 or 1", "UPDATE grocery_manual_items SET checked = 2"],
    ["a text timestamp", "UPDATE grocery_manual_items SET created_at = 'later'"],
    ["an unknown schema version", "UPDATE grocery_manual_items SET schema_version = 2"],
    ["a bad id", "UPDATE grocery_manual_items SET id = 'Bad ID'"],
  ])("an item row with %s reads as missing", async (_label, tamper) => {
    const { db, repo } = await setup();
    const item = expectAdded(await repo.addManualItem(WEEK, ITEM_INPUT));
    const good = expectAdded(await repo.addManualItem(WEEK, { name: "Bread" }));
    db.raw.prepare(`${tamper} WHERE id = ?`).run(item.id);

    expect(await repo.listManualItems(WEEK)).toEqual([good]);
    expect(await repo.setManualItemChecked(item.id, true)).toBe(false);
  });

  it("restart: a new repository on the same database sees the same check marks and items", async () => {
    const { db, repo } = await setup();
    await repo.setChecked(WEEK, KEY, true);
    const item = expectAdded(await repo.addManualItem(WEEK, ITEM_INPUT));
    await repo.setManualItemChecked(item.id, true);

    // The app runs the migrations on every start.
    await runMigrations(db);
    const restarted = createSqliteGroceryRepository(db, () => T0 + 2_000);
    expect(await restarted.listCheckedKeys(WEEK)).toEqual([KEY]);
    expect(await restarted.listManualItems(WEEK)).toEqual([{ ...item, checked: true }]);
  });

  it("stores a check mark as a row and removes the row when unchecked", async () => {
    const { db, repo } = await setup();
    await repo.setChecked(WEEK, KEY, true);
    expect(count(db, "grocery_checks")).toBe(1);
    await repo.setChecked(WEEK, KEY, false);
    expect(count(db, "grocery_checks")).toBe(0);
  });

  it("the default check limit is the most lines a week can have", async () => {
    const { db, repo } = await setup();
    const insert = db.raw.prepare("INSERT INTO grocery_checks (week_start, item_key) VALUES (?, ?)");
    for (let index = 0; index < 10_500; index += 1) insert.run(WEEK, `key-${index}`);
    expect(await repo.setChecked(WEEK, "one more", true)).toEqual({ ok: false, reason: "limit" });
    expect(await repo.listCheckedKeys(WEEK)).toHaveLength(10_500);
  });

  it("clear empties both tables", async () => {
    const { db, repo } = await setup();
    await repo.setChecked(WEEK, KEY, true);
    expectAdded(await repo.addManualItem(WEEK, ITEM_INPUT));
    await repo.clear();
    expect(count(db, "grocery_checks")).toBe(0);
    expect(count(db, "grocery_manual_items")).toBe(0);
  });
});
