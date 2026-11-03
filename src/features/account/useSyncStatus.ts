import type { SyncStatus } from "@/services/sync/SyncService";
import { useSyncService } from "@/services/ServiceProvider";
import { useSyncExternalStore } from "react";

// The current sync status (#19, N-19). Updates whenever the sync service reports a change.
// useSyncExternalStore re-draws the screen each time the service's status changes.
export function useSyncStatus(): SyncStatus {
  const sync = useSyncService();
  return useSyncExternalStore(sync.subscribe, sync.getStatus);
}
