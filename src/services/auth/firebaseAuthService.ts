import { withDomainErrors } from "@/services/domainErrors";
import { authErrorCode, isUserNotFound } from "@/services/firebase/firebaseErrors";
import type { FirebaseClient } from "@/services/firebase/client";
import {
  newAccountSchema,
  newPasswordSchema,
  passwordResetSchema,
  reauthSchema,
  signInSchema,
} from "@/validation/authSchema";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type User,
} from "firebase/auth";
import type { AuthErrorCode, AuthResult, AuthService, AuthUser } from "./AuthService";

// Shorthands for failed results.
const fail = (error: AuthErrorCode) => ({ ok: false, error }) as const;
const INVALID_INPUT = fail("invalid_input");
const NOT_SIGNED_IN = fail("requires_recent_login");

// Is this the same user, with the same details, as the one screens already have?
function isSameUser(current: AuthUser | null, user: User | null): boolean {
  if (current === null || user === null) return current === null && user === null;
  return current.uid === user.uid && current.email === user.email && current.emailVerified === user.emailVerified;
}

// Firebase Auth behind our AuthService. Behaves like the in-memory service; the shared
// contract suite is the specification. Never hands out a token, and the 30-day session
// rule stays in the session store.
export function createFirebaseAuthService({ client }: { client: Pick<FirebaseClient, "auth"> }): AuthService {
  const { auth } = client;
  const listeners = new Set<(user: AuthUser | null) => void>();
  let current: AuthUser | null = null;

  // Updates the user the screens see, and tells them. A new object only when something
  // changed, so currentUser() is a stable snapshot for useSyncExternalStore.
  function setCurrent(user: User | null) {
    if (isSameUser(current, user)) return;
    current = user ? { uid: user.uid, email: user.email, emailVerified: user.emailVerified } : null;
    listeners.forEach((listener) => listener(current));
  }

  // Resolves after Firebase's first report, once a saved session has been restored.
  // Firebase also reports changes later, sometimes after the call that caused them has
  // returned, so each method below updates the user itself too. Reading auth.currentUser
  // here means a late report can't bring back an old user. An error still counts as
  // ready, so the app can't get stuck starting up.
  const ready = new Promise<void>((resolve) => {
    onAuthStateChanged(
      auth,
      () => {
        setCurrent(auth.currentUser);
        resolve();
      },
      () => resolve(),
    );
  });

  // Runs a call that needs a signed-in user. Nobody signed in counts as needing to log in.
  async function asSignedInUser(call: (user: User) => Promise<void>): Promise<AuthResult> {
    const user = auth.currentUser;
    if (!user) return NOT_SIGNED_IN;
    try {
      await call(user);
      return { ok: true };
    } catch (error) {
      return fail(authErrorCode(error));
    }
  }

  return {
    whenReady: () => ready,

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
      try {
        const { user } = await createUserWithEmailAndPassword(auth, parsed.data.email, parsed.data.password);
        setCurrent(user);
        return { ok: true, user: current! };
      } catch (error) {
        return fail(authErrorCode(error, "sign_up"));
      }
    },

    async signIn(input) {
      const parsed = signInSchema.safeParse(input);
      if (!parsed.success) return INVALID_INPUT;
      try {
        const { user } = await signInWithEmailAndPassword(auth, parsed.data.email, parsed.data.password);
        setCurrent(user);
        return { ok: true, user: current! };
      } catch (error) {
        return fail(authErrorCode(error));
      }
    },

    // Signing out never needs the network.
    signOut: () =>
      withDomainErrors(async () => {
        await signOut(auth);
        setCurrent(null);
      }),

    async sendPasswordReset(input) {
      const parsed = passwordResetSchema.safeParse(input);
      if (!parsed.success) return INVALID_INPUT;
      try {
        await sendPasswordResetEmail(auth, parsed.data.email);
        return { ok: true };
      } catch (error) {
        // The same response whether or not the account exists (N-16).
        return isUserNotFound(error) ? { ok: true } : fail(authErrorCode(error, "password_reset"));
      }
    },

    async reauthenticate(input) {
      const parsed = reauthSchema.safeParse(input);
      if (!parsed.success) return INVALID_INPUT;
      const email = auth.currentUser?.email;
      if (!email) return NOT_SIGNED_IN;
      return asSignedInUser(async (user) => {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, parsed.data.password));
      });
    },

    async changePassword(input) {
      const parsed = newPasswordSchema.safeParse(input);
      if (!parsed.success) return INVALID_INPUT;
      return asSignedInUser((user) => updatePassword(user, parsed.data.newPassword));
    },

    // Deletes only the login (and signs out). AccountDeleter removes everything else.
    deleteAuthUser: () =>
      asSignedInUser(async (user) => {
        await deleteUser(user);
        setCurrent(null);
      }),

    sendVerificationEmail: () => asSignedInUser((user) => sendEmailVerification(user)),
  };
}
