import type { SyncStatus } from "@/services/sync/SyncService";
import { canSyncNow, syncSummary } from "../syncMessages";

const idle: SyncStatus = { state: "idle", lastSyncedAt: null, pendingChanges: 0, restore: null };

describe("sync summary (#19, N-19)", () => {
  it("explains that sync isn't set up yet (the current stub)", () => {
    expect(syncSummary({ ...idle, state: "unavailable" }, true)).toEqual({
      headline: "Sync isn't set up yet",
      detail: "Everything is saved on this phone.",
      tone: "muted",
    });
  });

  it("shows the last sync and pending changes", () => {
    expect(syncSummary(idle, true)).toMatchObject({ headline: "Not synced yet", detail: "Everything is synced." });
    const synced = syncSummary({ ...idle, lastSyncedAt: Date.UTC(2026, 9, 24, 15, 30), pendingChanges: 2 }, true);
    expect(synced.headline).toMatch(/^Last synced /);
    expect(synced.detail).toBe("2 changes waiting to sync.");
    expect(syncSummary({ ...idle, pendingChanges: 1 }, true).detail).toBe("1 change waiting to sync.");
  });

  it("shows the offline indicator, from the device or the sync service", () => {
    expect(syncSummary({ ...idle, pendingChanges: 3 }, false)).toMatchObject({
      headline: "Offline",
      detail: "3 changes will sync when you're back online.",
    });
    expect(syncSummary({ ...idle, state: "offline" }, true).headline).toBe("Offline");
  });

  it("shows syncing, errors and restore progress", () => {
    expect(syncSummary({ ...idle, state: "syncing" }, true).headline).toBe("Syncing…");
    expect(syncSummary({ ...idle, state: "error" }, true)).toMatchObject({ tone: "error" });
    expect(syncSummary({ ...idle, restore: { completed: 4, total: 10 } }, true).headline).toBe(
      "Restoring your data… 4 of 10",
    );
  });

  it("allows Sync now only when it can do something", () => {
    expect(canSyncNow(idle, true)).toBe(true);
    expect(canSyncNow({ ...idle, state: "error" }, null)).toBe(true);
    expect(canSyncNow(idle, false)).toBe(false);
    expect(canSyncNow({ ...idle, state: "syncing" }, true)).toBe(false);
    expect(canSyncNow({ ...idle, state: "unavailable" }, true)).toBe(false);
  });
});
