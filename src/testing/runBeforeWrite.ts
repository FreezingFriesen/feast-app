import type { SqlDatabase } from "@/storage/SqlDatabase";

// Wraps a database so `hook` runs just before a write whose SQL starts with `prefix`
// (the first `times` such writes). Lets a test make something happen between a
// repository's read and its write, e.g. a sync download landing mid-edit.
export function runBeforeWrite(
  db: SqlDatabase,
  prefix: string,
  hook: () => Promise<unknown>,
  times = 1,
): SqlDatabase {
  let remaining = times;
  return {
    execAsync: (source) => db.execAsync(source),
    getFirstAsync: (source, params) => db.getFirstAsync(source, params),
    getAllAsync: (source, params) => db.getAllAsync(source, params),
    async runAsync(source, params) {
      if (remaining > 0 && source.startsWith(prefix)) {
        remaining -= 1;
        await hook();
      }
      return db.runAsync(source, params);
    },
  };
}
