import type { InMemoryServer } from "@/services/backend/inMemoryServer";
import { errorCodeIn } from "@/services/domainErrors";
import type { RemoteDeleteResult } from "@/services/profiles/RemoteProfileStore";
import { uidSchema } from "@/validation/authSchema";
import type { RemoteUserContent } from "./RemoteUserContent";

const REMOTE_ERRORS = ["offline"] as const;

// Development backend: the content stored under users/{uid} on the in-memory server.
export function createInMemoryRemoteUserContent(server: InMemoryServer): RemoteUserContent {
  return {
    async deleteAll(uid): Promise<RemoteDeleteResult> {
      if (!uidSchema.safeParse(uid).success) return { ok: false, reason: "invalid_input" };
      try {
        return await server.run("content.deleteAll", (): RemoteDeleteResult => {
          if (server.signedInUid !== uid) return { ok: false, reason: "not_owner" };
          server.state.userContent.delete(uid);
          return { ok: true };
        });
      } catch (error) {
        return { ok: false, reason: errorCodeIn(error, REMOTE_ERRORS) };
      }
    },
  };
}
