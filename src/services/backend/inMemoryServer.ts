import type { StoredProfile } from "@/repositories/ProfileRepository";
import type { ConnectivityService } from "@/services/connectivity/ConnectivityService";
import { domainError, type DomainErrorCode } from "@/services/domainErrors";

// Named points where tests (or a dev panel) can inject a failure.
// usernames.claimCommit sits between staging a claim's two documents and committing them.
export type InMemoryOperation =
  | "auth.signUp"
  | "auth.signIn"
  | "auth.signOut"
  | "auth.sendPasswordReset"
  | "auth.reauthenticate"
  | "auth.changePassword"
  | "auth.deleteUser"
  | "auth.sendVerificationEmail"
  | "usernames.isAvailable"
  | "usernames.claim"
  | "usernames.claimCommit"
  | "usernames.release"
  | "profiles.fetch"
  | "profiles.delete"
  | "content.deleteAll";

// Firebase-like limits the fake also enforces.
// A sensitive change needs a login in the last 5 minutes; 5 wrong passwords lock
// sign in until a minute has passed since the last wrong one.
export const RECENT_LOGIN_MS = 5 * 60 * 1000;
export const MAX_FAILED_SIGN_INS = 5;
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// The password lives only in this in-memory map. It is never persisted, logged or
// returned, and everything here is gone when the app reloads.
export type InMemoryAccount = {
  uid: string;
  email: string;
  password: string;
  emailVerified: boolean;
  lastAuthAt: number;
};

// Everything the pretend server stores, laid out like the Firestore collections.
export type InMemoryServerState = {
  accounts: Map<string, InMemoryAccount>; // by lowercased email
  usernames: Map<string, string>; // usernames/{name} -> uid
  users: Map<string, StoredProfile>; // users/{uid}
  // Synced content under users/{uid} (e.g. "recipes/abc"). Filled by the sync engine later.
  userContent: Map<string, Set<string>>;
};

export type InMemoryServerControls = {
  // Simulates no connection, on top of the device's real connectivity.
  setOffline(offline: boolean): void;
  // The next `times` calls of `operation` fail with `code`.
  failNext(operation: InMemoryOperation, code?: DomainErrorCode, times?: number): void;
  // Cancels every failure set up with failNext.
  clearFailures(): void;
  // Moves the server clock forward (e.g. past the recent-login window).
  advanceClock(ms: number): void;
  // Simulates the user clicking the link in the verification email.
  markEmailVerified(uid: string): void;
};

// One simulated backend shared by the in-memory AuthService, UsernameRegistry,
// RemoteProfileStore and RemoteUserContent, the way the Firebase services share one project.
export type InMemoryServer = {
  readonly state: InMemoryServerState;
  // Set by the auth service; the registry checks it like Security Rules check request.auth.
  signedInUid: string | null;
  now(): number;
  // Runs one server call: latency, then connectivity, then any injected failure.
  run<T>(operation: InMemoryOperation, call: () => T, options?: { needsNetwork?: boolean }): Promise<T>;
  // Several writes applied together, like a Firestore batch: they go to copies of the
  // state, which replace it only if nothing fails before the commit.
  transaction(commitPoint: InMemoryOperation, write: (draft: InMemoryServerState) => void): void;
  // The wrong-password lock: check it, count a wrong password, or reset after a right one.
  isRateLimited(email: string): boolean;
  recordFailedSignIn(email: string): void;
  clearFailedSignIns(email: string): void;
  // Calls the listener with the uid whenever an account changes on the "server".
  onAccountChange(listener: (uid: string) => void): () => void;
  controls: InMemoryServerControls;
};

// connectivity: the phone's real network status. latencyMs: a pretend network delay.
// now: the clock, so tests can control time.
type InMemoryServerOptions = {
  connectivity: ConnectivityService;
  latencyMs?: number;
  now?: () => number;
};

export function createInMemoryServer({
  connectivity,
  latencyMs = 0,
  now = Date.now,
}: InMemoryServerOptions): InMemoryServer {
  let state: InMemoryServerState = {
    accounts: new Map(),
    usernames: new Map(),
    users: new Map(),
    userContent: new Map(),
  };
  // The dev controls: the offline switch and how far the clock has been moved forward.
  let offline = false;
  let clockOffset = 0;
  // Failures set up with failNext, and how many more times each one should happen.
  const failures = new Map<InMemoryOperation, { code: DomainErrorCode; remaining: number }>();
  // Wrong passwords per email, for the sign in lock.
  const failedSignIns = new Map<string, { count: number; lastFailureAt: number }>();
  const accountListeners = new Set<(uid: string) => void>();

  // The server's time: the real clock plus any advanceClock() moves.
  const serverNow = () => now() + clockOffset;

  // If a failure was set up for this operation, use up one and throw it.
  function takeInjectedFailure(operation: InMemoryOperation) {
    const failure = failures.get(operation);
    if (!failure) return;
    failure.remaining -= 1;
    if (failure.remaining <= 0) failures.delete(operation);
    throw domainError(failure.code);
  }

  const server: InMemoryServer = {
    get state() {
      return state;
    },
    signedInUid: null,
    now: serverNow,

    async run(operation, call, { needsNetwork = true } = {}) {
      if (latencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
      }
      if (needsNetwork && (offline || !(await connectivity.isOnline()))) {
        throw domainError("offline");
      }
      takeInjectedFailure(operation);
      return call();
    },

    // Copy the state, apply the writes to the copy, then swap it in. If a failure is
    // injected at the commit point, the copy is thrown away and nothing changes.
    transaction(commitPoint, write) {
      const draft: InMemoryServerState = {
        accounts: new Map(state.accounts),
        usernames: new Map(state.usernames),
        users: new Map(state.users),
        userContent: new Map(state.userContent),
      };
      write(draft);
      takeInjectedFailure(commitPoint);
      state = draft;
    },

    // Locked after MAX_FAILED_SIGN_INS wrong passwords; the count resets once the
    // window has passed since the last wrong one.
    isRateLimited(email) {
      const entry = failedSignIns.get(email);
      if (!entry) return false;
      if (serverNow() - entry.lastFailureAt >= RATE_LIMIT_WINDOW_MS) {
        failedSignIns.delete(email);
        return false;
      }
      return entry.count >= MAX_FAILED_SIGN_INS;
    },

    recordFailedSignIn(email) {
      const count = (failedSignIns.get(email)?.count ?? 0) + 1;
      failedSignIns.set(email, { count, lastFailureAt: serverNow() });
    },

    clearFailedSignIns(email) {
      failedSignIns.delete(email);
    },

    onAccountChange(listener) {
      accountListeners.add(listener);
      return () => {
        accountListeners.delete(listener);
      };
    },

    controls: {
      setOffline(value) {
        offline = value;
      },
      failNext(operation, code = "unknown", times = 1) {
        failures.set(operation, { code, remaining: times });
      },
      clearFailures() {
        failures.clear();
      },
      advanceClock(ms) {
        clockOffset += ms;
      },
      markEmailVerified(uid) {
        for (const account of state.accounts.values()) {
          if (account.uid === uid) {
            account.emailVerified = true;
            accountListeners.forEach((listener) => listener(uid));
          }
        }
      },
    },
  };

  return server;
}
