import { createNodeSqliteDatabase } from "@/testing/nodeSqliteDatabase";
import { MIGRATIONS, runMigrations } from "../migrations";

type TestDatabase = ReturnType<typeof createNodeSqliteDatabase>;

const version = (db: TestDatabase) =>
  (db.raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
// Our tables or indexes, leaving out the ones SQLite makes itself.
const names = (db: TestDatabase, type: "table" | "index") =>
  (
    db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name")
      .all(type) as { name: string }[]
  ).map((row) => row.name);

const PROFILE_ROW = ["Xy3kP9qLmN2vB7cD1eF4gH6jK8l0", "levi_f", '{"allergens":["milk"],"diets":[]}', 1, 2, 1];
const INSERT_PROFILE =
  "INSERT INTO profiles (uid, username, dietary_restrictions, created_at, updated_at, schema_version) VALUES (?, ?, ?, ?, ?, ?)";

describe("migrations", () => {
  it("brings a new database to the latest version with every table and index", async () => {
    const db = createNodeSqliteDatabase();
    await runMigrations(db);
    expect(version(db)).toBe(MIGRATIONS.length);
    expect(MIGRATIONS).toHaveLength(5);
    expect(names(db, "table")).toEqual([
      "grocery_checks",
      "grocery_manual_items",
      "meal_plan_entries",
      "profiles",
      "recipes",
      "sync_meta",
    ]);
    expect(names(db, "index")).toEqual([
      "grocery_manual_items_week",
      "meal_plan_entries_dirty",
      "meal_plan_entries_slot",
      "recipes_dirty",
      "recipes_updated_at",
    ]);
  });

  it("upgrades a version-1 database without losing its profiles", async () => {
    const db = createNodeSqliteDatabase();
    db.raw.exec(MIGRATIONS[0]);
    db.raw.prepare(INSERT_PROFILE).run(...PROFILE_ROW);
    expect(version(db)).toBe(1);

    await runMigrations(db);
    expect(version(db)).toBe(MIGRATIONS.length);
    expect(Object.values(db.raw.prepare("SELECT * FROM profiles").get() as object)).toEqual(PROFILE_ROW);
    expect(names(db, "table")).toContain("recipes");
  });

  it("upgrades a version-4 database to add the grocery tables without losing its meal plan", async () => {
    const db = createNodeSqliteDatabase();
    for (const migration of MIGRATIONS.slice(0, 4)) db.raw.exec(migration);
    db.raw
      .prepare(
        "INSERT INTO meal_plan_entries (id, date, meal_type, recipe_id, servings, created_at, updated_at, schema_version) VALUES ('e', '2026-11-09', 'dinner', 'r', 4, 1, 1, 1)",
      )
      .run();
    expect(version(db)).toBe(4);

    await runMigrations(db);
    expect(version(db)).toBe(5);
    expect(db.raw.prepare("SELECT id, servings FROM meal_plan_entries").all()).toEqual([{ id: "e", servings: 4 }]);
    expect(names(db, "table")).toEqual(expect.arrayContaining(["grocery_checks", "grocery_manual_items"]));
  });

  it("new grocery items start unchecked unless they say otherwise", async () => {
    const db = createNodeSqliteDatabase();
    await runMigrations(db);
    db.raw
      .prepare(
        "INSERT INTO grocery_manual_items (id, week_start, name, created_at, schema_version) VALUES ('i', '2026-11-09', 'Milk', 1, 1)",
      )
      .run();
    expect(db.raw.prepare("SELECT checked FROM grocery_manual_items").get()).toEqual({ checked: 0 });
  });

  it("can run again on every start without changing anything", async () => {
    const db = createNodeSqliteDatabase();
    await runMigrations(db);
    db.raw.prepare(INSERT_PROFILE).run(...PROFILE_ROW);
    await runMigrations(db);
    await runMigrations(db);
    expect(version(db)).toBe(MIGRATIONS.length);
    expect(db.raw.prepare("SELECT COUNT(*) AS count FROM profiles").get()).toEqual({ count: 1 });
  });

  it("marks new recipe and meal plan rows as not uploaded unless they say otherwise", async () => {
    const db = createNodeSqliteDatabase();
    await runMigrations(db);
    db.raw
      .prepare(
        "INSERT INTO meal_plan_entries (id, date, meal_type, recipe_id, servings, created_at, updated_at, schema_version) VALUES ('e', '2026-10-19', 'dinner', 'r', 1, 1, 1, 1)",
      )
      .run();
    expect(db.raw.prepare("SELECT dirty FROM meal_plan_entries").get()).toEqual({ dirty: 1 });
  });

  it("stops at a migration that fails and leaves the database as it was", async () => {
    const db = createNodeSqliteDatabase();
    await runMigrations(db);
    // A table a new migration would create already exists, so that migration fails.
    db.raw.exec(
      "PRAGMA user_version = 1; DROP TABLE meal_plan_entries; DROP TABLE sync_meta; DROP TABLE grocery_checks; DROP TABLE grocery_manual_items;",
    );
    await expect(runMigrations(db)).rejects.toThrow();
    expect(version(db)).toBe(1);
    expect(names(db, "table")).toEqual(["profiles", "recipes"]);
  });
});
