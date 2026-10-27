export type SqlValue = string | number | null;

// The expo-sqlite calls we use; expo-sqlite's SQLiteDatabase has this shape, and tests
// use node:sqlite. Values always go in `params` with "?" placeholders, never in the SQL
// text. execAsync is only for constant SQL (migrations).
export type SqlDatabase = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<{ changes: number }>;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
};
