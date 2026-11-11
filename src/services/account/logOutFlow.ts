import type { AuthService } from "@/services/auth/AuthService";
import { errorCodeIn } from "@/services/domainErrors";
import type { SessionGuard } from "@/services/session/sessionGuard";
import type { SyncService } from "@/services/sync/SyncService";
import { ACCOUNT_DECISIONS } from "./accountDecisions";
import type { LocalDataWiper } from "./LocalDataWiper";

// The longest the sync before the log out prompt may take. Log out never waits longer.
export const LOG_OUT_SYNC_TIMEOUT_MS = 10_000;

// sync_failed: "sync first" didn't finish, so the user was NOT logged out.
export type LogOutResult = { ok: true } | { ok: false; error: "sync_failed" | "storage_failed" | "unknown" };

export type LogOutFlow = {
  // Whether logging out also removes this device's local data, for the confirmation text.
  wipesLocalData: boolean;
  // Call before showing the confirmation: a best-effort sync, so as little as possible is
  // lost. Never fails and gives up after LOG_OUT_SYNC_TIMEOUT_MS. Returns how many
  // changes still aren't backed up, for the warning.
  prepare(): Promise<{ pendingChanges: number }>;
  // Works offline. The screen confirms first and warns about unsynced changes.
  logOut(options?: { syncFirst?: boolean }): Promise<LogOutResult>;
};

// wipeOnLogout defaults to the team decision; tests can pass either value.
type LogOutDependencies = {
  auth: AuthService;
  sessionGuard: SessionGuard;
  localData: LocalDataWiper;
  sync: SyncService;
  wipeOnLogout?: boolean;
  prepareTimeoutMs?: number;
};

// The only error code passed on as-is. Anything else becomes "unknown".
const LOG_OUT_ERRORS = ["storage_failed"] as const;

// Logs out: optionally syncs first, then stops sync, signs out, ends the 30-day session
// and (by default) clears this phone's data.
export function createLogOutFlow({
  auth,
  sessionGuard,
  localData,
  sync,
  wipeOnLogout = ACCOUNT_DECISIONS.wipeLocalDataOnLogout,
  prepareTimeoutMs = LOG_OUT_SYNC_TIMEOUT_MS,
}: LogOutDependencies): LogOutFlow {
  return {
    wipesLocalData: wipeOnLogout,

    async prepare() {
      // Whatever happens (offline, a failure, too slow), carry on to the prompt.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeLimit = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, prepareTimeoutMs);
      });
      try {
        await Promise.race([sync.syncNow().catch(() => undefined), timeLimit]);
      } finally {
        clearTimeout(timer);
      }
      return { pendingChanges: sync.getStatus().pendingChanges };
    },

    async logOut({ syncFirst = false } = {}) {
      if (syncFirst) {
        // Stay logged in unless everything synced, so nothing is lost by surprise.
        const synced = await sync.syncNow().then(
          (status) => status.state !== "error" && status.pendingChanges === 0,
          () => false,
        );
        if (!synced) return { ok: false, error: "sync_failed" };
      }

      try {
        // No sync may write to this phone or the server once we start removing things.
        await sync.stop();
        // Sign out first, so a failure below never leaves the user signed in.
        await auth.signOut();
        await sessionGuard.endSession();
        if (wipeOnLogout) {
          await localData.wipe();
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, error: errorCodeIn(error, LOG_OUT_ERRORS) };
      }
    },
  };
}
