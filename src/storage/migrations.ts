import type { SqlDatabase } from "./SqlDatabase";

// The local database schema, one entry per version, in order. Each entry is constant
// SQL (never built from values) that runs in a transaction and ends by recording its
// own version. Add new versions at the end and never edit old ones.
// Synced tables (recipes, meal plan entries) have `dirty`: 1 = changed on this phone and not
// uploaded yet, 0 = matches what was last uploaded or downloaded.
export const MIGRATIONS: readonly string[] = [
  // 1: user profiles (N-18). dietary_restrictions is JSON, or NULL for "not set yet".
  `BEGIN;
  CREATE TABLE profiles (
    uid TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL,
    dietary_restrictions TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    schema_version INTEGER NOT NULL
  );
  PRAGMA user_version = 1;
  COMMIT;`,
  // 2: recipes (#1). The four lists are JSON; NULL means an optional field is not set.
  `BEGIN;
  CREATE TABLE recipes (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    servings INTEGER NOT NULL,
    prep_time_minutes INTEGER,
    cook_time_minutes INTEGER,
    meal_types TEXT NOT NULL,
    ingredients TEXT NOT NULL,
    steps TEXT NOT NULL,
    diet_tags TEXT NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    schema_version INTEGER NOT NULL,
    dirty INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX recipes_updated_at ON recipes (updated_at);
  CREATE INDEX recipes_dirty ON recipes (dirty);
  PRAGMA user_version = 2;
  COMMIT;`,
  // 3: meal plan entries (#1, #4). One row per recipe in a slot (date + meal type).
  `BEGIN;
  CREATE TABLE meal_plan_entries (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    meal_type TEXT NOT NULL,
    recipe_id TEXT NOT NULL,
    servings INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    schema_version INTEGER NOT NULL,
    dirty INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX meal_plan_entries_slot ON meal_plan_entries (date, meal_type);
  CREATE INDEX meal_plan_entries_dirty ON meal_plan_entries (dirty);
  PRAGMA user_version = 3;
  COMMIT;`,
  // 4: sync metadata (N-19): who owns the local data, how far each collection has been
  // downloaded, and when the last sync finished. Keys come from a fixed list in
  // sqliteSyncMetaStore.ts; values are text, validated when read.
  `BEGIN;
  CREATE TABLE sync_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  PRAGMA user_version = 4;
  COMMIT;`,
];

// Brings the database up to the latest version. Safe to run on every app start.
export async function runMigrations(db: SqlDatabase): Promise<void> {
  // SQLite keeps the database's version number in user_version (0 for a new database).
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []);
  const current = row?.user_version ?? 0;
  // Run every migration the database hasn't had yet, oldest first. If one fails,
  // undo it and stop, so the database is never left half changed.
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    try {
      await db.execAsync(MIGRATIONS[version]);
    } catch (error) {
      await db.execAsync("ROLLBACK;").catch(() => {});
      throw error;
    }
  }
}
