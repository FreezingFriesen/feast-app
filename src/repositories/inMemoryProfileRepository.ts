import { UID_PATTERN } from "@/validation/patterns";
import { dietaryRestrictionsSchema, storedProfileSchema } from "@/validation/profileSchema";
import type { Profile, ProfileRepository } from "./ProfileRepository";

// Temporary store: profiles live only while the app is open.
// Replace with a SQLite implementation of ProfileRepository before the signed-in UI (Phase 4).
export function createInMemoryProfileRepository(
  now: () => number = Date.now,
): ProfileRepository {
  const profiles = new Map<string, Profile>();
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((listener) => listener());

  const find = (uid: string) => (UID_PATTERN.test(uid) ? profiles.get(uid) : undefined);

  return {
    async get(uid) {
      return find(uid);
    },

    async setDietaryRestrictions(uid, input) {
      const existing = find(uid);
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
      profiles.set(uid, profile);
      notify();
      return { ok: true, profile };
    },

    async mergeIncoming(uid, data) {
      if (!UID_PATTERN.test(uid)) return "invalid";
      const result = storedProfileSchema.safeParse(data);
      if (!result.success) return "invalid";

      // Last edit wins. On a tie the local copy stays, so downloading our own
      // upload again never replaces it.
      const existing = profiles.get(uid);
      if (existing && existing.updatedAt >= result.data.updatedAt) {
        return "kept_local";
      }

      profiles.set(uid, { ...result.data, uid });
      notify();
      return "applied";
    },

    async clear() {
      profiles.clear();
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
