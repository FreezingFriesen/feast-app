import type { SqlDatabase } from "./SqlDatabase";

// The local database schema, one entry per version, in order. Each entry is constant
// SQL (never built from values) that runs in a transaction and ends by recording its
// own version. Add new versions at the end and never edit old ones.
// Recipes and meal plans (#1) are added as version 2 onwards.
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
];

// Brings the database up to the latest version. Safe to run on every app start.
export async function runMigrations(db: SqlDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []);
  const current = row?.user_version ?? 0;
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    try {
      await db.execAsync(MIGRATIONS[version]);
    } catch (error) {
      await db.execAsync("ROLLBACK;").catch(() => {});
      throw error;
    }
  }
}
