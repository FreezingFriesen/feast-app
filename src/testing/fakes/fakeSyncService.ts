import type { SyncService, SyncStatus } from "@/services/sync/SyncService";

const IDLE: SyncStatus = { state: "idle", lastSyncedAt: null, pendingChanges: 0, restore: null, problem: null };

// A SyncService the test controls: set the status, and choose what "Sync now" does.
export function createFakeSyncService(initial: Partial<SyncStatus> = {}) {
  let status: SyncStatus = { ...IDLE, ...initial };
  let nextSync: (current: SyncStatus) => SyncStatus | Promise<SyncStatus> = (current) => ({
    ...current,
    state: "idle",
    pendingChanges: 0,
    lastSyncedAt: Date.now(),
  });
  // What happened, in order, so a test can check that sync stopped before something else.
  const calls: ("syncNow" | "stop")[] = [];
  const listeners = new Set<() => void>();

  const setStatus = (next: Partial<SyncStatus>) => {
    status = { ...status, ...next };
    listeners.forEach((listener) => listener());
  };

  const service: SyncService = {
    getStatus: () => status,
    async syncNow() {
      calls.push("syncNow");
      setStatus(await nextSync(status));
      return status;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async stop() {
      calls.push("stop");
    },
  };

  return {
    service,
    setStatus,
    calls,
    // Replace what the next "Sync now" does, e.g. leave changes pending, throw or hang.
    onSync(behaviour: (current: SyncStatus) => SyncStatus | Promise<SyncStatus>) {
      nextSync = behaviour;
    },
  };
}
