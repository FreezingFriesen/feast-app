import { domainError } from "@/services/domainErrors";
import type { AuthService } from "./AuthService";

const notConfigured = (): never => {
  throw domainError("backend_not_configured");
};

// Placeholder until the Firebase project exists (Phase 6). Every call fails with
// backend_not_configured, so EXPO_PUBLIC_BACKEND=firebase fails loudly instead of
// silently doing nothing. Deliberately imports nothing from Firebase yet.
export function createFirebaseAuthService(): AuthService {
  return {
    whenReady: async () => notConfigured(),
    currentUser: notConfigured,
    subscribe: notConfigured,
    signUp: async () => notConfigured(),
    signIn: async () => notConfigured(),
    signOut: async () => notConfigured(),
    sendPasswordReset: async () => notConfigured(),
    reauthenticate: async () => notConfigured(),
    changePassword: async () => notConfigured(),
    deleteAuthUser: async () => notConfigured(),
    sendVerificationEmail: async () => notConfigured(),
  };
}
