import type { SyncService, SyncStatus } from "./SyncService";

const UNAVAILABLE: SyncStatus = { state: "unavailable", lastSyncedAt: null, pendingChanges: 0, restore: null };

// Stands in until the sync engine (N-19) implements SyncService.
export function createStubSyncService(): SyncService {
  return {
    getStatus: () => UNAVAILABLE,
    syncNow: async () => UNAVAILABLE,
    subscribe: () => () => {},
  };
}
