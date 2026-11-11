import type { SqlDatabase } from "@/storage/SqlDatabase";
import type { RemoteCollection } from "@/services/userData/RemoteContentStore";
import { timestampSchema, uidSchema } from "@/validation/authSchema";
import { storedSyncTimestampSchema } from "@/validation/syncSchema";
import type { SyncMeta, SyncMetaStore } from "./SyncMetaStore";

// The only keys in the sync_meta table. Keys are never built from values.
const KEYS = {
  owner: "owner_uid",
  recipes: "recipes_high_water",
  mealPlanEntries: "meal_plan_entries_high_water",
  lastSyncedAt: "last_synced_at",
} as const satisfies Record<"owner" | "lastSyncedAt" | RemoteCollection, string>;

// Constant SQL only; every value is a "?" parameter.
const SELECT_ALL = "SELECT key, value FROM sync_meta";
const UPSERT = "INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";
const DELETE_ALL = "DELETE FROM sync_meta";

// Longer than any valid value (a uid is at most 128 characters); longer text isn't parsed.
const MAX_VALUE_LENGTH = 200;

type MetaRow = { key: string; value: string };

// A value read back is untrusted: anything that fails validation reads as missing.
function readValue<T>(rows: Map<string, unknown>, key: string, parse: (value: string) => T | undefined): T | null {
  const value = rows.get(key);
  if (typeof value !== "string" || value.length > MAX_VALUE_LENGTH) return null;
  return parse(value) ?? null;
}

const parseUid = (value: string) => {
  const result = uidSchema.safeParse(value);
  return result.success ? result.data : undefined;
};

const parseTimestamp = (value: string) => {
  const result = storedSyncTimestampSchema.safeParse(value);
  return result.success ? result.data : undefined;
};

// The sync metadata in the device's SQLite database (migration 4).
export function createSqliteSyncMetaStore(db: SqlDatabase): SyncMetaStore {
  const write = async (key: string, value: string) => {
    await db.runAsync(UPSERT, [key, value]);
  };

  return {
    async read(): Promise<SyncMeta> {
      const rows = new Map((await db.getAllAsync<MetaRow>(SELECT_ALL, [])).map((row) => [row.key, row.value]));
      return {
        ownerUid: readValue(rows, KEYS.owner, parseUid),
        highWater: {
          recipes: readValue(rows, KEYS.recipes, parseTimestamp),
          mealPlanEntries: readValue(rows, KEYS.mealPlanEntries, parseTimestamp),
        },
        lastSyncedAt: readValue(rows, KEYS.lastSyncedAt, parseTimestamp),
      };
    },

    async setOwner(uid) {
      if (uidSchema.safeParse(uid).success) await write(KEYS.owner, uid);
    },

    async setHighWater(collection, updatedAt) {
      if (timestampSchema.safeParse(updatedAt).success) await write(KEYS[collection], String(updatedAt));
    },

    async setLastSyncedAt(timestamp) {
      if (timestampSchema.safeParse(timestamp).success) await write(KEYS.lastSyncedAt, String(timestamp));
    },

    async clear() {
      await db.runAsync(DELETE_ALL, []);
    },
  };
}
