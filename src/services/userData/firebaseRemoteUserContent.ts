import { domainError } from "@/services/domainErrors";
import type { RemoteUserContent } from "./RemoteUserContent";

// Placeholder until the Firebase project exists (Phase 6). Every call fails with
// backend_not_configured. Deliberately imports nothing from Firebase yet.
export function createFirebaseRemoteUserContent(): RemoteUserContent {
  return {
    deleteAll: async () => {
      throw domainError("backend_not_configured");
    },
  };
}
