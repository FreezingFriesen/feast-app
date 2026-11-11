// Simulated phones that sync through one in-memory server, for the sync engine tests.
// Each phone has its own SQLite database (node:sqlite), repositories, sync metadata,
// sign-in and connectivity, wired the way createAppServices wires them.
import { createSqliteMealPlanRepository } from "@/repositories/sqliteMealPlanRepository";
import { createSqliteRecipeRepository } from "@/repositories/sqliteRecipeRepository";
import { createInMemoryAuthService } from "@/services/auth/inMemoryAuthService";
import { createInMemoryServer } from "@/services/backend/inMemoryServer";
import { createSyncService, type Schedule } from "@/services/sync/createSyncService";
import { createSqliteSyncMetaStore } from "@/services/sync/sqliteSyncMetaStore";
import { createInMemoryRemoteContentStore } from "@/services/userData/inMemoryRemoteContentStore";
import type { RemoteContentStore } from "@/services/userData/RemoteContentStore";
import { runMigrations } from "@/storage/migrations";
import { createFakeConnectivity } from "./fakes/fakeConnectivity";
import { createNodeSqliteDatabase } from "./nodeSqliteDatabase";

// The server's clock (and the phones', unless a phone's clock is set off) starts here.
export const T0 = Date.UTC(2026, 9, 1, 12);
export const PASSWORD = "correct horse battery";

// Lets waiting promise callbacks and timers run (node:sqlite answers straight away).
export async function settle(rounds = 20) {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

// The shared server and its clock.
export function createSyncWorld() {
  let time = T0;
  const connectivity = createFakeConnectivity(true);
  const server = createInMemoryServer({ connectivity: connectivity.service, now: () => time });
  return {
    server,
    now: () => time,
    advance(ms = 1_000) {
      time += ms;
    },
  };
}

export type SyncWorld = ReturnType<typeof createSyncWorld>;

type DeviceOptions = {
  // How far this phone's clock is from the server's.
  clockOffsetMs?: number;
  // Wraps the remote store, e.g. to watch or delay calls.
  wrapRemote?: (remote: RemoteContentStore) => RemoteContentStore;
};

export async function createSyncDevice(world: SyncWorld, { clockOffsetMs = 0, wrapRemote }: DeviceOptions = {}) {
  let offset = clockOffsetMs;
  const now = () => world.now() + offset;
  const db = createNodeSqliteDatabase();
  await runMigrations(db);
  const recipes = createSqliteRecipeRepository(db, now);
  const mealPlans = createSqliteMealPlanRepository(db, now);
  const meta = createSqliteSyncMetaStore(db);
  const auth = createInMemoryAuthService(world.server);
  const realRemote = createInMemoryRemoteContentStore(world.server);
  const remote = wrapRemote ? wrapRemote(realRemote) : realRemote;
  const connectivity = createFakeConnectivity(true);

  // Debounced syncs wait here until the test runs them, so tests never depend on timing.
  const scheduled = new Set<() => void>();
  const schedule: Schedule = (callback) => {
    scheduled.add(callback);
    return () => {
      scheduled.delete(callback);
    };
  };

  const sync = createSyncService({ auth, remote, recipes, mealPlans, meta, connectivity: connectivity.service, now, schedule });

  return {
    db,
    recipes,
    mealPlans,
    meta,
    auth,
    remote,
    realRemote,
    connectivity,
    sync,
    now,
    setClockOffset(ms: number) {
      offset = ms;
    },
    scheduledCount: () => scheduled.size,
    // Runs the debounced syncs that are waiting, as if their time had come. Settles first,
    // so changes the repositories just reported have been scheduled.
    async runScheduled() {
      await settle();
      const callbacks = [...scheduled];
      scheduled.clear();
      callbacks.forEach((callback) => callback());
      await settle();
    },
    async signUp(email: string) {
      const result = await auth.signUp({ email, password: PASSWORD });
      if (!result.ok) throw new Error(`Sign up failed: ${result.error}`);
      return result.user.uid;
    },
    async signIn(email: string) {
      const result = await auth.signIn({ email, password: PASSWORD });
      if (!result.ok) throw new Error(`Sign in failed: ${result.error}`);
      return result.user.uid;
    },
  };
}

export type SyncDevice = Awaited<ReturnType<typeof createSyncDevice>>;

// The documents the server holds for a user in one collection, by ID.
export function serverDocuments(world: SyncWorld, uid: string, collection: "recipes" | "mealPlanEntries") {
  const prefix = `${collection}/`;
  return new Map(
    [...(world.server.state.userContent.get(uid) ?? [])]
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, data]) => [path.slice(prefix.length), data]),
  );
}

// Puts a document on the server directly, skipping the rules (to set up a test).
export function plantDocument(
  world: SyncWorld,
  uid: string,
  collection: "recipes" | "mealPlanEntries",
  id: string,
  data: unknown,
) {
  const documents = world.server.state.userContent.get(uid) ?? new Map<string, Record<string, unknown>>();
  documents.set(`${collection}/${id}`, data as Record<string, unknown>);
  world.server.state.userContent.set(uid, documents);
}
