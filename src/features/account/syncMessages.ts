import type { SyncStatus } from "@/services/sync/SyncService";

// A summary of the sync status, for display in the account screen. It includes a headline, a detail message, and a tone (muted or error).
export type SyncSummary = { headline: string; detail: string | null; tone: "muted" | "error" };

// A helper function to format the number of pending changes for display. It returns "1 change" for one change, and "N changes" for N changes.
const changesText = (count: number) => (count === 1 ? "1 change" : `${count} changes`);

// Format a timestamp for display in the sync section. Uses the user's locale and shows the month, day, hour, and minute.
export function formatSyncTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// What the sync section says (#19, N-19). Display only; the sync engine is separate work.
export function syncSummary(status: SyncStatus, online: boolean | null): SyncSummary {
  if (status.restore) {
    return {
      headline: `Restoring your data… ${status.restore.completed} of ${status.restore.total}`,
      detail: "You can keep using the app while this finishes.",
      tone: "muted",
    };
  }
  if (status.state === "unavailable") {
    return { headline: "Sync isn't set up yet", detail: "Everything is saved on this phone.", tone: "muted" };
  }
  if (online === false || status.state === "offline") {
    return {
      headline: "Offline",
      detail:
        status.pendingChanges > 0
          ? `${changesText(status.pendingChanges)} will sync when you're back online.`
          : "Changes are saved on this phone and will sync when you're back online.",
      tone: "muted",
    };
  }
  if (status.state === "syncing") {
    return { headline: "Syncing…", detail: null, tone: "muted" };
  }
  if (status.state === "error") {
    return {
      headline: "The last sync didn't finish",
      detail: "Your changes are still saved on this phone. Try again.",
      tone: "error",
    };
  }
  return {
    headline: status.lastSyncedAt === null ? "Not synced yet" : `Last synced ${formatSyncTime(status.lastSyncedAt)}`,
    detail:
      status.pendingChanges > 0 ? `${changesText(status.pendingChanges)} waiting to sync.` : "Everything is synced.",
    tone: "muted",
  };
}

// Can the user sync now? They can if they're online and the sync engine is available and not already syncing.
export function canSyncNow(status: SyncStatus, online: boolean | null): boolean {
  return online !== false && status.state !== "unavailable" && status.state !== "syncing";
}
