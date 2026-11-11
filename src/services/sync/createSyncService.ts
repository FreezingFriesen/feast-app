// The sync engine (N-19, #19): keeps the phone's recipes and meal plans and the server's
// copy in step, in the foreground only. Offline-first: everything works without it, and
// it catches up when a user is signed in and online.
import type { MealPlanRepository } from "@/repositories/MealPlanRepository";
import type { RecipeRepository } from "@/repositories/RecipeRepository";
import type { AuthService } from "@/services/auth/AuthService";
import type { ConnectivityService } from "@/services/connectivity/ConnectivityService";
import type { RemoteContentStore } from "@/services/userData/RemoteContentStore";
import { storedMealPlanEntrySchema } from "@/validation/mealPlanSchema";
import { storedRecipeSchema } from "@/validation/recipeSchema";
import type { SyncMetaStore } from "./SyncMetaStore";
import type { SyncService, SyncStatus } from "./SyncService";
import { runSync, type SyncedCollection, type SyncReport } from "./syncRun";

// How long after the last local change a sync starts, so a burst of edits syncs once.
export const SYNC_DEBOUNCE_MS = 3_000;

const SIGNED_OUT: SyncStatus = {
  state: "unavailable",
  lastSyncedAt: null,
  pendingChanges: 0,
  restore: null,
  problem: null,
};

// Runs `callback` after `ms`. Returns a function that cancels it.
export type Schedule = (callback: () => void, ms: number) => () => void;

const defaultSchedule: Schedule = (callback, ms) => {
  const timer = setTimeout(callback, ms);
  return () => clearTimeout(timer);
};

type SyncServiceDependencies = {
  auth: Pick<AuthService, "currentUser" | "subscribe">;
  remote: RemoteContentStore;
  recipes: Pick<RecipeRepository, "listPending" | "pendingCount" | "markSynced" | "mergeIncoming" | "subscribe">;
  mealPlans: Pick<MealPlanRepository, "listPending" | "pendingCount" | "markSynced" | "mergeIncoming" | "subscribe">;
  meta: SyncMetaStore;
  connectivity: ConnectivityService;
  now?: () => number;
  debounceMs?: number;
  schedule?: Schedule;
};

export type SyncEngine = SyncService & {
  // Starts listening for sign in and out, connectivity and local changes, and syncs
  // straight away if someone is signed in. Returns a function that stops listening.
  start(): () => void;
  // Counts from the last run, for tests and diagnostics. Never shown, never logged.
  lastReport(): SyncReport | null;
};

// The stored-record check each upload goes through, as a plain function.
const validator = (schema: typeof storedRecipeSchema | typeof storedMealPlanEntrySchema) => (data: unknown) => {
  const result = schema.safeParse(data);
  return result.success ? (result.data as Record<string, unknown>) : undefined;
};

export function createSyncService({
  auth,
  remote,
  recipes,
  mealPlans,
  meta,
  connectivity,
  now = Date.now,
  debounceMs = SYNC_DEBOUNCE_MS,
  schedule = defaultSchedule,
}: SyncServiceDependencies): SyncEngine {
  // Recipes first, so a downloaded meal plan entry usually finds its recipe.
  const collections: SyncedCollection[] = [
    { name: "recipes", repository: recipes, validate: validator(storedRecipeSchema) },
    { name: "mealPlanEntries", repository: mealPlans, validate: validator(storedMealPlanEntrySchema) },
  ];

  let status: SyncStatus = SIGNED_OUT;
  const listeners = new Set<() => void>();
  // Moves on whenever the user changes or sync is stopped. A run that started under an
  // older generation writes nothing more.
  let generation = 0;
  // stop() pauses sync for this user until a different user signs in.
  let pausedUid: string | null = null;
  // The user the status is about.
  let knownUid: string | null = null;
  let inFlight: { generation: number; promise: Promise<SyncStatus> } | null = null;
  let cancelDebounce: (() => void) | null = null;
  let report: SyncReport | null = null;
  // A local change while a run is uploading may have missed it, so another run follows.
  // (Changes during the download are uploaded later in the same run.)
  let uploading = false;
  let changedDuringUpload = false;

  // A new status object only when something changed (useSyncExternalStore needs that).
  function setStatus(patch: Partial<SyncStatus>) {
    const next = { ...status, ...patch };
    if (JSON.stringify(next) === JSON.stringify(status)) return;
    status = next;
    listeners.forEach((listener) => listener());
  }

  // The signed-in user, unless sync is paused for them.
  function activeUid(): string | null {
    const uid = auth.currentUser()?.uid ?? null;
    return uid !== null && uid !== pausedUid ? uid : null;
  }

  const countPending = async () => (await recipes.pendingCount()) + (await mealPlans.pendingCount());

  function cancelScheduled() {
    cancelDebounce?.();
    cancelDebounce = null;
  }

  function scheduleSync() {
    cancelScheduled();
    cancelDebounce = schedule(() => {
      cancelDebounce = null;
      void syncNow();
    }, debounceMs);
  }

  // The status for a user who just signed in (or appeared at app start), before the first
  // run: when they last synced and what's waiting.
  async function loadStatus(uid: string) {
    const saved = await meta.read();
    const pendingChanges = await countPending();
    if (activeUid() !== uid) return;
    const lastSyncedAt = saved.ownerUid === uid ? saved.lastSyncedAt : null;
    // A run that already started owns the state.
    setStatus(
      inFlight
        ? { lastSyncedAt, pendingChanges }
        : { lastSyncedAt, pendingChanges, state: "idle", restore: null, problem: null },
    );
  }

  async function runOnce(): Promise<SyncStatus> {
    cancelScheduled();
    const uid = activeUid();
    if (uid === null) {
      setStatus(SIGNED_OUT);
      return status;
    }
    const runGeneration = generation;
    const stillCurrent = () =>
      generation === runGeneration && pausedUid !== uid && auth.currentUser()?.uid === uid;

    try {
      if (!(await connectivity.isOnline())) {
        const pendingChanges = await countPending();
        if (stillCurrent()) setStatus({ state: "offline", pendingChanges, restore: null });
        return status;
      }
      setStatus({ state: "syncing" });
      const { outcome, report: runReport } = await runSync({
        uid,
        remote,
        meta,
        collections,
        stillCurrent,
        onRestoreProgress: (restore) => {
          if (stillCurrent()) setStatus({ restore });
        },
        onUploadStart: () => {
          uploading = true;
        },
      });
      report = runReport;
      // Stopped, signed out or another user: whoever replaced this run owns the status.
      if (outcome === "stopped" || !stillCurrent()) return status;

      const pendingChanges = await countPending();
      if (!stillCurrent()) return status;
      if (outcome === "offline") {
        setStatus({ state: "offline", pendingChanges, restore: null });
      } else if (outcome === "other_account") {
        setStatus({ state: "error", pendingChanges, restore: null, problem: { kind: "other_account" } });
      } else if (outcome === "failed") {
        setStatus({ state: "error", pendingChanges, restore: null, problem: { kind: "failed" } });
      } else if (runReport.rejected > 0) {
        setStatus({
          state: "error",
          pendingChanges,
          restore: null,
          problem: { kind: "rejected", count: runReport.rejected },
        });
      } else {
        const lastSyncedAt = now();
        await meta.setLastSyncedAt(lastSyncedAt);
        if (stillCurrent()) setStatus({ state: "idle", pendingChanges, lastSyncedAt, restore: null, problem: null });
      }
    } catch {
      // Nothing is lost: local data is the source of truth. No details are kept or logged.
      if (stillCurrent()) setStatus({ state: "error", restore: null, problem: { kind: "failed" } });
    } finally {
      const followUp = changedDuringUpload;
      uploading = false;
      changedDuringUpload = false;
      if (followUp && stillCurrent()) scheduleSync();
    }
    return status;
  }

  // One run at a time. A call during a run shares it; a call after the user changed waits
  // for the old run to finish, then starts a new one.
  function syncNow(): Promise<SyncStatus> {
    if (inFlight && inFlight.generation === generation) return inFlight.promise;
    const previous = inFlight?.promise;
    const promise = (async () => {
      if (previous) await previous;
      return runOnce();
    })();
    const entry = { generation, promise };
    inFlight = entry;
    const clear = () => {
      if (inFlight === entry) inFlight = null;
    };
    promise.then(clear, clear);
    return promise;
  }

  async function onLocalChange() {
    if (activeUid() === null) return;
    // A run that is downloading uploads the change later on; one that is uploading gets
    // a follow-up when it ends. Noted before any await, so a run ending meanwhile sees it.
    if (inFlight !== null && uploading) changedDuringUpload = true;
    const pendingChanges = await countPending();
    if (activeUid() === null) return;
    setStatus({ pendingChanges });
    if (inFlight === null && pendingChanges > 0) scheduleSync();
  }

  function onUserChange(uid: string | null) {
    if (uid === knownUid) return;
    knownUid = uid;
    generation += 1;
    cancelScheduled();
    if (pausedUid !== null && pausedUid !== uid) pausedUid = null;
    if (uid === null) {
      setStatus(SIGNED_OUT);
      return;
    }
    // Show when they last synced, then sync.
    void loadStatus(uid)
      .catch(() => {})
      .then(() => {
        if (knownUid === uid) void syncNow();
      });
  }

  return {
    getStatus: () => status,
    syncNow,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async stop() {
      generation += 1;
      pausedUid = auth.currentUser()?.uid ?? null;
      cancelScheduled();
      setStatus({ state: "unavailable", restore: null });
      // Wait for the run in progress: it stops at its next check, and anything it was
      // already writing finishes before the caller wipes or deletes.
      const running = inFlight?.promise;
      if (running) await running;
    },

    start() {
      const stops = [
        auth.subscribe((user) => onUserChange(user?.uid ?? null)),
        connectivity.subscribe((online) => {
          if (activeUid() === null) return;
          if (online) void syncNow();
          else if (status.state !== "syncing") setStatus({ state: "offline", restore: null });
        }),
        recipes.subscribe(() => void onLocalChange().catch(() => {})),
        mealPlans.subscribe(() => void onLocalChange().catch(() => {})),
      ];
      knownUid = null;
      onUserChange(auth.currentUser()?.uid ?? null);
      return () => {
        stops.forEach((stopListening) => stopListening());
        cancelScheduled();
        generation += 1;
      };
    },

    lastReport: () => report,
  };
}
