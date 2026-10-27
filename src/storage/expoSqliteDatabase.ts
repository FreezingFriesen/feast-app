import * as SQLite from "expo-sqlite";
import { runMigrations } from "./migrations";
import type { SqlDatabase } from "./SqlDatabase";

const DATABASE_NAME = "feast.db";

// The device's local database (offline-first source of truth). expo-sqlite is
// bundled in Expo Go. Not encrypted: SQLCipher would need a development build.
export async function openAppDatabase(): Promise<SqlDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await runMigrations(db);
  return db;
}
