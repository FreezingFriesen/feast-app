import type { InMemoryServer } from "@/services/backend/inMemoryServer";
import { errorCodeIn } from "@/services/domainErrors";
import { uidSchema } from "@/validation/authSchema";
import { storedProfileSchema } from "@/validation/profileSchema";
import type { RemoteDeleteResult, RemoteProfileResult, RemoteProfileStore } from "./RemoteProfileStore";

const REMOTE_ERRORS = ["offline"] as const;

// Development backend: users/{uid} on the in-memory server.
export function createInMemoryRemoteProfileStore(server: InMemoryServer): RemoteProfileStore {
  return {
    async fetch(uid): Promise<RemoteProfileResult> {
      if (!uidSchema.safeParse(uid).success) return { ok: false, reason: "invalid_input" };
      try {
        return await server.run("profiles.fetch", (): RemoteProfileResult => {
          // Least privilege, like the Security Rules: only your own document.
          if (server.signedInUid !== uid) return { ok: false, reason: "not_owner" };
          const stored = server.state.users.get(uid);
          if (stored === undefined) return { ok: true, profile: null };
          const parsed = storedProfileSchema.safeParse(stored);
          return parsed.success ? { ok: true, profile: parsed.data } : { ok: false, reason: "unknown" };
        });
      } catch (error) {
        return { ok: false, reason: errorCodeIn(error, REMOTE_ERRORS) };
      }
    },

    async delete(uid): Promise<RemoteDeleteResult> {
      if (!uidSchema.safeParse(uid).success) return { ok: false, reason: "invalid_input" };
      try {
        return await server.run("profiles.delete", (): RemoteDeleteResult => {
          if (server.signedInUid !== uid) return { ok: false, reason: "not_owner" };
          server.state.users.delete(uid);
          return { ok: true };
        });
      } catch (error) {
        return { ok: false, reason: errorCodeIn(error, REMOTE_ERRORS) };
      }
    },
  };
}
