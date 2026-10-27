// unavailable: the sync engine isn't built yet (N-19 is separate work).
export type SyncState = "idle" | "syncing" | "offline" | "error" | "unavailable";

export type SyncStatus = {
  state: SyncState;
  lastSyncedAt: number | null;
  pendingChanges: number;
  // Set while restoring data after logging in on a new device (#19).
  restore: { completed: number; total: number } | null;
};

// What the Account tab shows about sync (#19, N-19). Display and "Sync now" only.
export type SyncService = {
  // Returns the same object until the status changes, so it can back useSyncExternalStore.
  getStatus(): SyncStatus;
  // Uploads local changes and downloads remote ones. Resolves with the status afterwards.
  syncNow(): Promise<SyncStatus>;
  // Calls the listener after every status change. Returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
};
