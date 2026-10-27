import {
  RECENT_LOGIN_MS,
  type InMemoryAccount,
  type InMemoryOperation,
  type InMemoryServer,
} from "@/services/backend/inMemoryServer";
import { errorCodeIn, withDomainErrors } from "@/services/domainErrors";
import {
  newAccountSchema,
  newPasswordSchema,
  passwordResetSchema,
  reauthSchema,
  signInSchema,
} from "@/validation/authSchema";
import {
  AUTH_ERROR_CODES,
  type AuthErrorCode,
  type AuthResult,
  type AuthService,
  type AuthUser,
  type AuthUserResult,
} from "./AuthService";

const UID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// 28 letters and digits, like a Firebase uid (matches UID_PATTERN).
function newUid(): string {
  let uid = "";
  for (let i = 0; i < 28; i += 1) {
    uid += UID_ALPHABET[Math.floor(Math.random() * UID_ALPHABET.length)];
  }
  return uid;
}

const fail = (error: AuthErrorCode) => ({ ok: false, error }) as const;
const INVALID_INPUT = fail("invalid_input");
const INVALID_CREDENTIALS = fail("invalid_credentials");

// Development backend: behaves like Firebase Auth closely enough to build and test the
// Account screens. Nothing survives a reload. Refused in production (createAppServices).
export function createInMemoryAuthService(server: InMemoryServer): AuthService {
  const listeners = new Set<(user: AuthUser | null) => void>();
  let current: AuthUser | null = null;

  // A new object only when the user changes, so currentUser() is a stable snapshot.
  function setCurrent(account: InMemoryAccount | null) {
    current = account ? { uid: account.uid, email: account.email, emailVerified: account.emailVerified } : null;
    server.signedInUid = account?.uid ?? null;
    listeners.forEach((listener) => listener(current));
  }

  server.onAccountChange((uid) => {
    const account = signedInAccount();
    if (account && account.uid === uid) setCurrent(account);
  });

  function signedInAccount(): InMemoryAccount | undefined {
    return current?.email ? server.state.accounts.get(current.email) : undefined;
  }

  const isRecent = (account: InMemoryAccount) => server.now() - account.lastAuthAt <= RECENT_LOGIN_MS;

  // Runs a server call. Expected failures (offline, injected errors) become results.
  async function call<R extends AuthResult | AuthUserResult>(
    operation: InMemoryOperation,
    body: () => R,
  ): Promise<R | ReturnType<typeof fail>> {
    try {
      return await server.run(operation, body);
    } catch (error) {
      return fail(errorCodeIn(error, AUTH_ERROR_CODES));
    }
  }

  return {
    async whenReady() {
      // Nothing to restore: the in-memory backend forgets everything on reload.
    },

    currentUser: () => current,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async signUp(input) {
      const parsed = newAccountSchema.safeParse(input);
      if (!parsed.success) return INVALID_INPUT;
      const { email, password } = parsed.data;

      return call("auth.signUp", (): AuthUserResult => {
        // Same answer as any other failure, so sign up can't be used to find accounts.
        if (server.state.accounts.has(email)) return fail("sign_up_failed");
        const account: InMemoryAccount = {
          uid: newUid(),
          email,
          password,
          emailVerified: false,
          lastAuthAt: server.now(),
        };
        server.state.accounts.set(email, account);
        setCurrent(account);
        return { ok: true, user: current! };
      });
    },

    async signIn(input) {
      const parsed = signInSchema.safeParse(input);
      if (!parsed.success) return INVALID_INPUT;
      const { email, password } = parsed.data;

      return call("auth.signIn", (): AuthUserResult => {
        if (server.isRateLimited(email)) return fail("rate_limited");
        const account = server.state.accounts.get(email);
        // Unknown email and wrong password give the same result.
        if (!account || account.password !== password) {
          server.recordFailedSignIn(email);
          return INVALID_CREDENTIALS;
        }
        server.clearFailedSignIns(email);
        account.lastAuthAt = server.now();
        setCurrent(account);
        return { ok: true, user: current! };
      });
    },

    signOut: () =>
      withDomainErrors(() => server.run("auth.signOut", () => setCurrent(null), { needsNetwork: false })),

    async sendPasswordReset(input) {
      if (!passwordResetSchema.safeParse(input).success) return INVALID_INPUT;
      // The same response whether or not the account exists (N-16).
      return call("auth.sendPasswordReset", (): AuthResult => ({ ok: true }));
    },

    async reauthenticate(input) {
      const parsed = reauthSchema.safeParse(input);
      if (!parsed.success) return INVALID_INPUT;

      return call("auth.reauthenticate", (): AuthResult => {
        const account = signedInAccount();
        if (!account) return fail("requires_recent_login");
        if (server.isRateLimited(account.email)) return fail("rate_limited");
        if (account.password !== parsed.data.password) {
          server.recordFailedSignIn(account.email);
          return INVALID_CREDENTIALS;
        }
        server.clearFailedSignIns(account.email);
        account.lastAuthAt = server.now();
        return { ok: true };
      });
    },

    async changePassword(input) {
      const parsed = newPasswordSchema.safeParse(input);
      if (!parsed.success) return INVALID_INPUT;

      return call("auth.changePassword", (): AuthResult => {
        const account = signedInAccount();
        if (!account || !isRecent(account)) return fail("requires_recent_login");
        account.password = parsed.data.newPassword;
        return { ok: true };
      });
    },

    async deleteAuthUser() {
      // Deletes only the sign-in account. The user's documents and username are
      // removed by AccountDeleter, the same as with Firebase.
      return call("auth.deleteUser", (): AuthResult => {
        const account = signedInAccount();
        if (!account || !isRecent(account)) return fail("requires_recent_login");
        server.state.accounts.delete(account.email);
        setCurrent(null);
        return { ok: true };
      });
    },

    async sendVerificationEmail() {
      return call("auth.sendVerificationEmail", (): AuthResult =>
        signedInAccount() ? { ok: true } : fail("requires_recent_login"),
      );
    },
  };
}
