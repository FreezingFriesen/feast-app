import { domainError } from "@/services/domainErrors";
import type { UsernameRegistry } from "./UsernameRegistry";

const notConfigured = (): never => {
  throw domainError("backend_not_configured");
};

// Placeholder until the Firebase project exists (Phase 6). Every call fails with
// backend_not_configured. Deliberately imports nothing from Firebase yet.
export function createFirebaseUsernameRegistry(): UsernameRegistry {
  return {
    isAvailable: async () => notConfigured(),
    claim: async () => notConfigured(),
    release: async () => notConfigured(),
  };
}
