import type { AuthService } from "@/services/auth/AuthService";
import { domainError } from "@/services/domainErrors";

const fail = (): never => {
  throw domainError("backend_not_configured");
};

// An AuthService whose every call throws, to prove the flows turn a thrown error into a result.
export function createThrowingAuthService(): AuthService {
  return {
    whenReady: async () => fail(),
    currentUser: fail,
    subscribe: fail,
    signUp: async () => fail(),
    signIn: async () => fail(),
    signOut: async () => fail(),
    sendPasswordReset: async () => fail(),
    reauthenticate: async () => fail(),
    changePassword: async () => fail(),
    deleteAuthUser: async () => fail(),
    sendVerificationEmail: async () => fail(),
  };
}
