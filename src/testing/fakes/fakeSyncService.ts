import type { SyncService, SyncStatus } from "@/services/sync/SyncService";

const IDLE: SyncStatus = { state: "idle", lastSyncedAt: null, pendingChanges: 0, restore: null };

// A SyncService the test controls: set the status, and choose what "Sync now" does.
export function createFakeSyncService(initial: Partial<SyncStatus> = {}) {
  let status: SyncStatus = { ...IDLE, ...initial };
  let nextSync: (current: SyncStatus) => SyncStatus = (current) => ({
    ...current,
    state: "idle",
    pendingChanges: 0,
    lastSyncedAt: Date.now(),
  });
  const listeners = new Set<() => void>();

  const setStatus = (next: Partial<SyncStatus>) => {
    status = { ...status, ...next };
    listeners.forEach((listener) => listener());
  };

  const service: SyncService = {
    getStatus: () => status,
    async syncNow() {
      setStatus(nextSync(status));
      return status;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return {
    service,
    setStatus,
    // Replace what the next "Sync now" does, e.g. leave changes pending or throw.
    onSync(behaviour: (current: SyncStatus) => SyncStatus) {
      nextSync = behaviour;
    },
  };
}
