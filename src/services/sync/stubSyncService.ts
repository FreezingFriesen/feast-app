import type { SyncService, SyncStatus } from "./SyncService";

// The only status the stub ever reports: sync isn't set up yet.
const UNAVAILABLE: SyncStatus = { state: "unavailable", lastSyncedAt: null, pendingChanges: 0, restore: null };

// Stands in until the sync engine (N-19) implements SyncService.
// "Sync now" does nothing, and there are never any changes to report.
export function createStubSyncService(): SyncService {
  return {
    getStatus: () => UNAVAILABLE,
    syncNow: async () => UNAVAILABLE,
    subscribe: () => () => {},
  };
}
