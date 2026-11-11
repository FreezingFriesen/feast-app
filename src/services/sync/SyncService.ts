// unavailable: nobody is signed in, or sync is paused for this user (see stop()).
export type SyncState = "idle" | "syncing" | "offline" | "error" | "unavailable";

// Why the last sync ended in "error". Nothing on the phone is lost in any of them.
// rejected: the server refused `count` changes, usually because the phone's clock is set
//   too far ahead. They stay on the phone and are tried again on the next sync.
// other_account: the recipes and meal plans on this phone belong to another account, so
//   nothing syncs until logging out clears them.
// failed: something else went wrong.
export type SyncProblem = { kind: "rejected"; count: number } | { kind: "other_account" } | { kind: "failed" };

export type SyncStatus = {
  state: SyncState;
  // When the last sync finished with nothing refused or failed, or null if none has.
  lastSyncedAt: number | null;
  // How many changes on this phone haven't been uploaded yet.
  pendingChanges: number;
  // Set while restoring data after logging in on a new device (#19). total is null when
  // the server couldn't say how many records there are.
  restore: { completed: number; total: number | null } | null;
  // Set when state is "error".
  problem: SyncProblem | null;
};

// Recipe and meal plan sync (#19, N-19). Screens use getStatus, syncNow and subscribe.
export type SyncService = {
  // Returns the same object until the status changes, so it can back useSyncExternalStore.
  getStatus(): SyncStatus;
  // Downloads remote changes, then uploads local ones. Resolves with the status afterwards.
  // A call while a sync is running waits for that sync instead of starting another.
  syncNow(): Promise<SyncStatus>;
  // Calls the listener after every status change. Returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
  // Stops syncing for the signed-in user: cancels the sync in progress and waits for it
  // to finish, and starts no new one until a different user signs in (or the app
  // restarts). Call before wiping local data or deleting the account.
  stop(): Promise<void>;
};
