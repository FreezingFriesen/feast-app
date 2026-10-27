import type { SqlDatabase } from "@/storage/SqlDatabase";
import { UID_PATTERN } from "@/validation/patterns";
import { dietaryRestrictionsSchema, storedProfileSchema } from "@/validation/profileSchema";
import type { Profile, ProfileRepository } from "./ProfileRepository";

type ProfileRow = {
  uid: string;
  username: string;
  dietary_restrictions: string | null;
  created_at: number;
  updated_at: number;
  schema_version: number;
};

// Constant SQL only; every value is a "?" parameter.
const SELECT_PROFILE =
  "SELECT uid, username, dietary_restrictions, created_at, updated_at, schema_version FROM profiles WHERE uid = ?";
// Last edit wins inside SQLite: an existing row is replaced only by a newer one.
const UPSERT_IF_NEWER = `INSERT INTO profiles (uid, username, dietary_restrictions, created_at, updated_at, schema_version)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(uid) DO UPDATE SET
    username = excluded.username,
    dietary_restrictions = excluded.dietary_restrictions,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    schema_version = excluded.schema_version
  WHERE excluded.updated_at > profiles.updated_at`;
const UPDATE_RESTRICTIONS = "UPDATE profiles SET dietary_restrictions = ?, updated_at = ? WHERE uid = ?";
const DELETE_ALL = "DELETE FROM profiles";

// Far more than a valid restrictions object needs; anything longer is not parsed.
const MAX_RESTRICTIONS_JSON_LENGTH = 2000;

// Rows read back are untrusted like any stored data: a row that fails validation
// reads as missing instead of reaching the screens.
function toProfile(row: ProfileRow | null): Profile | undefined {
  if (!row || !UID_PATTERN.test(row.uid)) return undefined;
  let restrictions: unknown = null;
  if (row.dietary_restrictions !== null) {
    if (row.dietary_restrictions.length > MAX_RESTRICTIONS_JSON_LENGTH) return undefined;
    try {
      restrictions = JSON.parse(row.dietary_restrictions);
    } catch {
      return undefined;
    }
  }
  const result = storedProfileSchema.safeParse({
    username: row.username,
    dietaryRestrictions: restrictions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version,
  });
  return result.success ? { ...result.data, uid: row.uid } : undefined;
}

const restrictionsColumn = (profile: Profile) =>
  profile.dietaryRestrictions === null ? null : JSON.stringify(profile.dietaryRestrictions);

// Profiles in the device's SQLite database: the offline-first source of truth for the
// Account screen. Sync uploads changes later (last edit wins).
export function createSqliteProfileRepository(
  db: SqlDatabase,
  now: () => number = Date.now,
): ProfileRepository {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  async function get(uid: string): Promise<Profile | undefined> {
    if (!UID_PATTERN.test(uid)) return undefined;
    return toProfile(await db.getFirstAsync<ProfileRow>(SELECT_PROFILE, [uid]));
  }

  return {
    get,

    async setDietaryRestrictions(uid, input) {
      const existing = await get(uid);
      if (!existing) {
        return { ok: false, reason: "not_found" };
      }
      // The repository check is the one that counts: validate before every write.
      const result = dietaryRestrictionsSchema.safeParse(input);
      if (!result.success) {
        return { ok: false, reason: "invalid", error: result.error };
      }

      // Never move updatedAt backwards (e.g. the clock was changed), so this edit
      // still wins over the copy it replaces. Validate the merged record too.
      const merged = storedProfileSchema.safeParse({
        ...existing,
        dietaryRestrictions: result.data,
        updatedAt: Math.max(now(), existing.updatedAt + 1),
      });
      if (!merged.success) {
        return { ok: false, reason: "invalid", error: merged.error };
      }

      const profile: Profile = { ...merged.data, uid };
      await db.runAsync(UPDATE_RESTRICTIONS, [restrictionsColumn(profile), profile.updatedAt, uid]);
      notify();
      return { ok: true, profile };
    },

    async mergeIncoming(uid, data) {
      if (!UID_PATTERN.test(uid)) return "invalid";
      const result = storedProfileSchema.safeParse(data);
      if (!result.success) return "invalid";

      // On a tie the local copy stays, so downloading our own upload again never replaces it.
      const profile: Profile = { ...result.data, uid };
      const { changes } = await db.runAsync(UPSERT_IF_NEWER, [
        uid,
        profile.username,
        restrictionsColumn(profile),
        profile.createdAt,
        profile.updatedAt,
        profile.schemaVersion,
      ]);
      if (changes === 0) return "kept_local";
      notify();
      return "applied";
    },

    async clear() {
      await db.runAsync(DELETE_ALL, []);
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
