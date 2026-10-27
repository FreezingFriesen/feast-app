import { domainError } from "@/services/domainErrors";
import type { RemoteProfileStore } from "./RemoteProfileStore";

const notConfigured = async (): Promise<never> => {
  throw domainError("backend_not_configured");
};

// Placeholder until the Firebase project exists (Phase 6). Every call fails with
// backend_not_configured. Deliberately imports nothing from Firebase yet.
export function createFirebaseRemoteProfileStore(): RemoteProfileStore {
  return {
    fetch: notConfigured,
    delete: notConfigured,
  };
}
