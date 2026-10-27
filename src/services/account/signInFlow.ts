import type { ProfileRepository } from "@/repositories/ProfileRepository";
import {
  AUTH_ERROR_CODES,
  type AuthErrorCode,
  type AuthResult,
  type AuthService,
} from "@/services/auth/AuthService";
import { errorCodeIn } from "@/services/domainErrors";
import type { RemoteProfileStore } from "@/services/profiles/RemoteProfileStore";
import type { SessionGuard } from "@/services/session/sessionGuard";
import { signInSchema } from "@/validation/authSchema";

// ready: the profile is on the device.
// needs_username: signed in, but there's no profile anywhere (sign up stopped half way).
// unavailable: no copy on the device and it couldn't be downloaded right now.
export type ProfileState = "ready" | "needs_username" | "unavailable";

export type SignInResult =
  | { status: "signed_in"; profile: ProfileState }
  | { status: "failed"; error: AuthErrorCode };

export type SignInFlow = {
  // N-14: email and password (signInSchema). Needs a connection.
  signIn(input: unknown): Promise<SignInResult>;
  // N-16: the same result whether or not the account exists (passwordResetSchema).
  sendPasswordReset(input: unknown): Promise<AuthResult>;
};

type ProfileSources = { profiles: ProfileRepository; remoteProfiles: RemoteProfileStore };
type SignInDependencies = ProfileSources & { auth: AuthService; sessionGuard: SessionGuard };

const failed = (error: AuthErrorCode) => ({ status: "failed", error }) as const;

// Downloads the signed-in user's profile and keeps whichever copy is newer (last edit
// wins). Restores the profile after logging in on a new device (#19).
export async function refreshProfile({ profiles, remoteProfiles }: ProfileSources, uid: string): Promise<ProfileState> {
  const [remote, local] = await Promise.all([remoteProfiles.fetch(uid), profiles.get(uid)]);
  if (remote.ok && remote.profile) {
    await profiles.mergeIncoming(uid, remote.profile);
    return "ready";
  }
  if (local) return "ready";
  return remote.ok ? "needs_username" : "unavailable";
}

export function createSignInFlow({ auth, sessionGuard, ...sources }: SignInDependencies): SignInFlow {
  return {
    async signIn(input) {
      try {
        const parsed = signInSchema.safeParse(input);
        if (!parsed.success) return failed("invalid_input");

        // Before signing in: the app-wide session check runs as soon as the user appears.
        await sessionGuard.startSession();
        const result = await auth.signIn(parsed.data);
        if (!result.ok) {
          await sessionGuard.endSession().catch(() => {});
          return failed(result.error);
        }

        const profile = await refreshProfile(sources, result.user.uid).catch((): ProfileState => "unavailable");
        return { status: "signed_in", profile };
      } catch (error) {
        return failed(errorCodeIn(error, AUTH_ERROR_CODES));
      }
    },

    async sendPasswordReset(input) {
      try {
        return await auth.sendPasswordReset(input);
      } catch (error) {
        return { ok: false, error: errorCodeIn(error, AUTH_ERROR_CODES) };
      }
    },
  };
}
