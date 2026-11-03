// The kinds of value that can go in a "?" placeholder.
export type SqlValue = string | number | null;

// The expo-sqlite calls we use; expo-sqlite's SQLiteDatabase has this shape, and tests
// use node:sqlite. Values always go in `params` with "?" placeholders, never in the SQL
// text. execAsync is only for constant SQL (migrations).
export type SqlDatabase = {
  // Runs SQL that returns nothing (migrations only).
  execAsync(source: string): Promise<void>;
  // An INSERT, UPDATE or DELETE. "changes" is how many rows it touched.
  runAsync(source: string, params: SqlValue[]): Promise<{ changes: number }>;
  // The first matching row, or null if there are none.
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  // Every matching row.
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
};
