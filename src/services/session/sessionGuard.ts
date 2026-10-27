import { ACCOUNT_DECISIONS } from "@/services/account/accountDecisions";
import type { LocalDataWiper } from "@/services/account/LocalDataWiper";
import type { AuthService } from "@/services/auth/AuthService";
import { withDomainErrors } from "@/services/domainErrors";
import type { SecureSessionStore } from "./SecureSessionStore";
import type { SessionPolicy } from "./SessionPolicy";

export type SessionCheck =
  | { state: "signed_out" }
  | { state: "active"; expiresAt: number }
  // The user was signed out. The UI shows why and sends them to log in.
  | { state: "ended"; reason: "expired" | "missing" | "clock_before_login" };

export type SessionGuard = {
  // Records the login date. Call just *before* signing in or up: the app-wide check runs
  // as soon as the user appears, and a missing login date would sign them straight out.
  startSession(): Promise<void>;
  // Removes the login date and the auth SDK's stored session (log out, failed log in).
  endSession(): Promise<void>;
  // Call on app start and whenever the app returns to the foreground (N-15).
  check(): Promise<SessionCheck>;
};

type SessionGuardDependencies = {
  auth: AuthService;
  store: SecureSessionStore;
  policy: SessionPolicy;
  wiper: LocalDataWiper;
  now?: () => number;
  wipeOnExpiry?: boolean;
};

// Enforces the 30-day session on the device. Firebase refresh tokens never expire
// on their own, so without this a session would last forever.
export function createSessionGuard({
  auth,
  store,
  policy,
  wiper,
  now = Date.now,
  wipeOnExpiry = ACCOUNT_DECISIONS.wipeLocalDataOnSessionExpiry,
}: SessionGuardDependencies): SessionGuard {
  return {
    startSession: () =>
      // The device clock, not a server time: the policy compares against this same
      // clock, and a phone running a few seconds behind the server would otherwise
      // look like "clock before login" and be signed out straight away.
      withDomainErrors(() => store.setLoginAt(now())),

    endSession: () => withDomainErrors(() => store.clear()),

    check: () =>
      withDomainErrors(async (): Promise<SessionCheck> => {
        await auth.whenReady();
        if (!auth.currentUser()) {
          return { state: "signed_out" };
        }

        const status = policy.evaluate(await store.getLoginAt());
        if (status.state === "active") {
          return { state: "active", expiresAt: status.expiresAt };
        }

        await auth.signOut();
        await store.clear();
        if (wipeOnExpiry) {
          await wiper.wipe();
        }
        return { state: "ended", reason: status.state === "expired" ? "expired" : status.reason };
      }),
  };
}
