import type { StoredProfile } from "@/repositories/ProfileRepository";
import type { InMemoryServer } from "@/services/backend/inMemoryServer";
import { errorCodeIn } from "@/services/domainErrors";
import { uidSchema, usernameSchema } from "@/validation/authSchema";
import { PROFILE_SCHEMA_VERSION, storedProfileSchema } from "@/validation/profileSchema";
import type {
  UsernameAvailability,
  UsernameClaimResult,
  UsernameRegistry,
  UsernameReleaseResult,
} from "./UsernameRegistry";

const AVAILABILITY_ERRORS = ["offline"] as const;
const CLAIM_ERRORS = ["offline", "taken", "not_owner", "invalid_input"] as const;
const RELEASE_ERRORS = ["offline", "not_owner", "invalid_input"] as const;

// Development backend for usernames/{name} and users/{uid}, sharing the in-memory
// server with the in-memory AuthService. Mirrors the planned Security Rules: only the
// signed-in user can claim or release, and names are unique ignoring case.
export function createInMemoryUsernameRegistry(server: InMemoryServer): UsernameRegistry {
  return {
    async isAvailable(username): Promise<UsernameAvailability> {
      // usernameSchema lowercases, so "Levi" and "levi" are the same name.
      const parsed = usernameSchema.safeParse(username);
      if (!parsed.success) return "invalid_input";
      try {
        return await server.run("usernames.isAvailable", () =>
          server.state.usernames.has(parsed.data) ? "taken" : "available",
        );
      } catch (error) {
        return errorCodeIn(error, AVAILABILITY_ERRORS);
      }
    },

    async claim(uid, username): Promise<UsernameClaimResult> {
      const parsedUid = uidSchema.safeParse(uid);
      const parsedName = usernameSchema.safeParse(username);
      if (!parsedUid.success || !parsedName.success) return { ok: false, reason: "invalid_input" };
      const name = parsedName.data;

      try {
        return await server.run("usernames.claim", (): UsernameClaimResult => {
          if (server.signedInUid !== uid) return { ok: false, reason: "not_owner" };
          // One username per user, and each name has one owner.
          if (server.state.usernames.has(name) || server.state.users.has(uid)) {
            return { ok: false, reason: "taken" };
          }

          const timestamp = server.now();
          const profile: StoredProfile = storedProfileSchema.parse({
            username: name,
            dietaryRestrictions: null,
            createdAt: timestamp,
            updatedAt: timestamp,
            schemaVersion: PROFILE_SCHEMA_VERSION,
          });
          // Both documents in one atomic write: either both exist afterwards or neither does.
          server.transaction("usernames.claimCommit", (draft) => {
            draft.usernames.set(name, uid);
            draft.users.set(uid, profile);
          });
          return { ok: true, profile };
        });
      } catch (error) {
        return { ok: false, reason: errorCodeIn(error, CLAIM_ERRORS) };
      }
    },

    async release(uid, username): Promise<UsernameReleaseResult> {
      const parsedUid = uidSchema.safeParse(uid);
      const parsedName = usernameSchema.safeParse(username);
      if (!parsedUid.success || !parsedName.success) return { ok: false, reason: "invalid_input" };
      const name = parsedName.data;

      try {
        return await server.run("usernames.release", (): UsernameReleaseResult => {
          const owner = server.state.usernames.get(name);
          // Already free: succeeding here makes a half-finished account deletion retryable.
          if (owner === undefined) return { ok: true };
          if (owner !== uid || server.signedInUid !== uid) return { ok: false, reason: "not_owner" };
          server.state.usernames.delete(name);
          return { ok: true };
        });
      } catch (error) {
        return { ok: false, reason: errorCodeIn(error, RELEASE_ERRORS) };
      }
    },
  };
}
