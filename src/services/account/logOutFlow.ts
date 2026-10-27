import type { AuthService } from "@/services/auth/AuthService";
import { errorCodeIn } from "@/services/domainErrors";
import type { SessionGuard } from "@/services/session/sessionGuard";
import type { SyncService } from "@/services/sync/SyncService";
import { ACCOUNT_DECISIONS } from "./accountDecisions";
import type { LocalDataWiper } from "./LocalDataWiper";

// sync_failed: "sync first" didn't finish, so the user was NOT logged out.
export type LogOutResult = { ok: true } | { ok: false; error: "sync_failed" | "storage_failed" | "unknown" };

export type LogOutFlow = {
  // Whether logging out also removes this device's local data, for the confirmation text.
  wipesLocalData: boolean;
  // Works offline. The screen confirms first and warns about unsynced changes.
  logOut(options?: { syncFirst?: boolean }): Promise<LogOutResult>;
};

type LogOutDependencies = {
  auth: AuthService;
  sessionGuard: SessionGuard;
  localData: LocalDataWiper;
  sync: SyncService;
  wipeOnLogout?: boolean;
};

const LOG_OUT_ERRORS = ["storage_failed"] as const;

export function createLogOutFlow({
  auth,
  sessionGuard,
  localData,
  sync,
  wipeOnLogout = ACCOUNT_DECISIONS.wipeLocalDataOnLogout,
}: LogOutDependencies): LogOutFlow {
  return {
    wipesLocalData: wipeOnLogout,

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
