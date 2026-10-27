// node:sqlite needs Node's types (tsconfig only loads Jest's). This file is test-only
// and never imported by the app, so it is never bundled.
/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import type { SqlDatabase } from "@/storage/SqlDatabase";

// A real SQLite engine for tests (Node's built-in node:sqlite), behind the same
// interface as expo-sqlite. `raw` lets a test inspect or tamper with tables directly.
export function createNodeSqliteDatabase(): SqlDatabase & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  return {
    raw,
    async execAsync(source) {
      raw.exec(source);
    },
    async runAsync(source, params) {
      const result = raw.prepare(source).run(...params);
      return { changes: Number(result.changes) };
    },
    async getFirstAsync<T>(source: string, params: (string | number | null)[]) {
      return (raw.prepare(source).get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(source: string, params: (string | number | null)[]) {
      return raw.prepare(source).all(...params) as T[];
    },
  };
}
