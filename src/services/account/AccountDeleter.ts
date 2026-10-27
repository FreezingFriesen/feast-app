import type { ProfileRepository } from "@/repositories/ProfileRepository";
import type { AuthService } from "@/services/auth/AuthService";
import { isDomainError, type DomainErrorCode } from "@/services/domainErrors";
import type { RemoteProfileStore } from "@/services/profiles/RemoteProfileStore";
import type { SessionGuard } from "@/services/session/sessionGuard";
import type { RemoteUserContent } from "@/services/userData/RemoteUserContent";
import type { UsernameRegistry } from "@/services/usernames/UsernameRegistry";
import { deleteAccountSchema } from "@/validation/authSchema";
import type { LocalDataWiper } from "./LocalDataWiper";

// The steps run in this order, and each one is safe to run again, so a deletion that
// fails half way is retried from the start. The users/{uid} profile holds the username,
// so it is deleted only after the username is released: a retry from any device can
// still find which name to release.
export type AccountDeletionStep =
  | "confirm"
  | "reauthenticate"
  | "delete_data"
  | "release_username"
  | "delete_profile"
  | "delete_auth_user"
  | "wipe_local";

export type AccountDeletionResult =
  | { ok: true }
  | { ok: false; failedStep: AccountDeletionStep; error: DomainErrorCode };

// N-17. Runs from the app for the capstone; Cloud Functions would need the Blaze plan.
export type AccountDeleter = {
  // deleteAccountSchema: the current password and the username typed as a confirmation.
  // Needs a connection for every step except the last.
  deleteAccount(input: unknown): Promise<AccountDeletionResult>;
};

type AccountDeleterDependencies = {
  auth: AuthService;
  usernames: UsernameRegistry;
  remoteProfiles: RemoteProfileStore;
  remoteContent: RemoteUserContent;
  profiles: ProfileRepository;
  sessionGuard: SessionGuard;
  localData: LocalDataWiper;
};

export function createAccountDeleter({
  auth,
  usernames,
  remoteProfiles,
  remoteContent,
  profiles,
  sessionGuard,
  localData,
}: AccountDeleterDependencies): AccountDeleter {
  return {
    async deleteAccount(input) {
      let step: AccountDeletionStep = "confirm";
      const failAt = (error: DomainErrorCode): AccountDeletionResult => ({ ok: false, failedStep: step, error });

      try {
        const user = auth.currentUser();
        if (!user) return failAt("requires_recent_login");
        const parsed = deleteAccountSchema.safeParse(input);
        if (!parsed.success) return failAt("invalid_input");
        // The typed username must match. The device copy stays until the last step,
        // so this also works when retrying.
        const local = await profiles.get(user.uid);
        if (!local || parsed.data.confirmation !== local.username) return failAt("invalid_input");

        step = "reauthenticate";
        const reauth = await auth.reauthenticate({ password: parsed.data.password });
        if (!reauth.ok) return failAt(reauth.error);

        step = "delete_data";
        const content = await remoteContent.deleteAll(user.uid);
        if (!content.ok) return failAt(content.reason);

        step = "release_username";
        // Prefer the server's copy; on a retry after the profile was deleted, the device copy.
        const remote = await remoteProfiles.fetch(user.uid);
        if (!remote.ok) return failAt(remote.reason);
        const username = remote.profile?.username ?? local.username;
        const released = await usernames.release(user.uid, username);
        // not_owner: someone else holds the name now, so ours was already released.
        if (!released.ok && released.reason !== "not_owner") return failAt(released.reason);

        step = "delete_profile";
        const profileDeleted = await remoteProfiles.delete(user.uid);
        if (!profileDeleted.ok) return failAt(profileDeleted.reason);

        step = "delete_auth_user";
        const authDeleted = await auth.deleteAuthUser();
        if (!authDeleted.ok) return failAt(authDeleted.error);

        // Always wipes, whatever the log out decision: the account no longer exists.
        step = "wipe_local";
        await sessionGuard.endSession();
        await localData.wipe();
        return { ok: true };
      } catch (error) {
        return failAt(isDomainError(error) ? error.code : "unknown");
      }
    },
  };
}
