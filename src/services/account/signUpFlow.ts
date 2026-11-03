import type { ProfileRepository } from "@/repositories/ProfileRepository";
import { AUTH_ERROR_CODES, type AuthErrorCode, type AuthService } from "@/services/auth/AuthService";
import { errorCodeIn } from "@/services/domainErrors";
import type { SessionGuard } from "@/services/session/sessionGuard";
import type { UsernameRegistry } from "@/services/usernames/UsernameRegistry";
import { chooseUsernameSchema, signUpFormSchema } from "@/validation/authSchema";

// Why sign up failed. "taken" belongs to the username field; the rest are auth codes.
export type SignUpErrorCode = AuthErrorCode | "taken";
const SIGN_UP_ERRORS = [...AUTH_ERROR_CODES, "taken"] as const;

export type SignUpResult =
  | { status: "signed_up" }
  // The account exists and is signed in, but the username couldn't be saved and the
  // account couldn't be undone. The user chooses a username again.
  | { status: "needs_username"; error: SignUpErrorCode }
  | { status: "failed"; error: SignUpErrorCode };

// Saved, or why the username couldn't be saved.
export type ChooseUsernameResult = { ok: true } | { ok: false; error: SignUpErrorCode };

export type SignUpFlow = {
  // N-13: email, unique username and password (signUpFormSchema).
  signUp(input: unknown): Promise<SignUpResult>;
  // For a signed-in account that has no username yet (a sign up that stopped half way).
  chooseUsername(input: unknown): Promise<ChooseUsernameResult>; // chooseUsernameSchema
};

type SignUpDependencies = {
  auth: AuthService;
  usernames: UsernameRegistry;
  profiles: ProfileRepository;
  sessionGuard: SessionGuard;
};

// Shorthand for a failed sign up result.
const failed = (error: SignUpErrorCode) => ({ status: "failed", error }) as const;

// Cleanup that must not hide the real result.
const quietly = (promise: Promise<unknown>) => promise.catch(() => {});

// Each method returns a result and never throws, so screens only check the status.
export function createSignUpFlow({ auth, usernames, profiles, sessionGuard }: SignUpDependencies): SignUpFlow {
  // Claims the name (which creates users/{uid}) and caches the profile on the device,
  // so the Account screen works offline straight away.
  async function claimAndCache(uid: string, username: string): Promise<ChooseUsernameResult> {
    const claim = await usernames.claim(uid, username);
    // not_owner isn't something the user can fix, so it's shown as a general error.
    if (!claim.ok) {
      const error = claim.reason === "not_owner" ? "unknown" : claim.reason;
      return { ok: false, error };
    }
    // Best effort: the profile is on the server, so the Account screen can download it.
    await profiles.mergeIncoming(uid, claim.profile).catch(() => "invalid");
    return { ok: true };
  }

  return {
    async signUp(input) {
      try {
        const parsed = signUpFormSchema.safeParse(input);
        if (!parsed.success) return failed("invalid_input");
        const { email, username, password } = parsed.data;

        // Checked first so a taken name doesn't create an account that has to be undone.
        // The claim below is still the real guarantee.
        const availability = await usernames.isAvailable(username);
        if (availability !== "available") return failed(availability);

        // Start the 30-day session, then create the login. If that fails, end the session again.
        await sessionGuard.startSession();
        const created = await auth.signUp({ email, password });
        if (!created.ok) {
          await quietly(sessionGuard.endSession());
          return failed(created.error);
        }

        const claimed = await claimAndCache(created.user.uid, username);
        if (claimed.ok) return { status: "signed_up" };

        // Undo the half-made account so the user can simply try again. It was just
        // created, so deleting it needs no new login.
        const undone = await auth.deleteAuthUser();
        if (undone.ok) {
          await quietly(sessionGuard.endSession());
          return failed(claimed.error);
        }
        // Couldn't undo it either: the user stays signed in and chooses a username next.
        return { status: "needs_username", error: claimed.error };
      } catch (error) {
        return failed(errorCodeIn(error, SIGN_UP_ERRORS));
      }
    },

    // The user ID comes from the signed-in session, never from the screen.
    async chooseUsername(input) {
      try {
        const user = auth.currentUser();
        if (!user) return { ok: false, error: "requires_recent_login" };
        const parsed = chooseUsernameSchema.safeParse(input);
        if (!parsed.success) return { ok: false, error: "invalid_input" };
        return await claimAndCache(user.uid, parsed.data.username);
      } catch (error) {
        return { ok: false, error: errorCodeIn(error, SIGN_UP_ERRORS) };
      }
    },
  };
}
