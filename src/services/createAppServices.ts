// The composition root: the only place that picks implementations.
import { createIngredientCatalogStore } from "@/repositories/IngredientCatalogStore";
import type { Repositories } from "@/repositories/RepositoryProvider";
import { createSqliteGroceryRepository } from "@/repositories/sqliteGroceryRepository";
import { createSqliteIngredientRepository } from "@/repositories/sqliteIngredientRepository";
import { createSqliteMealPlanRepository } from "@/repositories/sqliteMealPlanRepository";
import { createSqliteProfileRepository } from "@/repositories/sqliteProfileRepository";
import { createSqliteRecipeRepository } from "@/repositories/sqliteRecipeRepository";
import type { SqlDatabase } from "@/storage/SqlDatabase";
import { backendSchema, type Backend } from "@/validation/configSchema";
import { createLocalDataWiper } from "./account/LocalDataWiper";
import type { AuthService } from "./auth/AuthService";
import { createInMemoryAuthService } from "./auth/inMemoryAuthService";
import { createInMemoryServer, type InMemoryServerControls } from "./backend/inMemoryServer";
import type { ConnectivityService } from "./connectivity/ConnectivityService";
import { domainError } from "./domainErrors";
import { createIngredientRefresh, type IngredientRefreshEngine } from "./ingredients/createIngredientRefresh";
import { createInMemoryRemoteIngredientSource } from "./ingredients/inMemoryRemoteIngredientSource";
import type { RemoteIngredientSource } from "./ingredients/RemoteIngredientSource";
import { createInMemoryRemoteProfileStore } from "./profiles/inMemoryRemoteProfileStore";
import type { RemoteProfileStore } from "./profiles/RemoteProfileStore";
import type { Services } from "./ServiceProvider";
import type { ChunkedSecureStorage } from "./session/chunkedSecureStorage";
import type { SecureKeyValueStore } from "./session/secureKeyValue";
import { createSecureSessionStore } from "./session/SecureSessionStore";
import { createSessionGuard } from "./session/sessionGuard";
import { createSessionPolicy } from "./session/SessionPolicy";
import { createSyncService, type SyncEngine } from "./sync/createSyncService";
import { createSqliteSyncMetaStore } from "./sync/sqliteSyncMetaStore";
import { createInMemoryRemoteContentStore } from "./userData/inMemoryRemoteContentStore";
import { createInMemoryRemoteUserContent } from "./userData/inMemoryRemoteUserContent";
import type { RemoteContentStore } from "./userData/RemoteContentStore";
import type { RemoteUserContent } from "./userData/RemoteUserContent";
import { createInMemoryUsernameRegistry } from "./usernames/inMemoryUsernameRegistry";
import type { UsernameRegistry } from "./usernames/UsernameRegistry";

// Makes the in-memory backend feel like a real network in development.
export const DEV_LATENCY_MS = 400;

// EXPO_PUBLIC_BACKEND chooses the backend; unset means "memory". The in-memory backend
// is for development only, so a production build refuses it, and unknown values are
// refused everywhere (allowlist).
export function resolveBackend(raw: string | undefined, isDev: boolean): Backend {
  const parsed = backendSchema.safeParse(raw ?? "memory");
  if (!parsed.success || (parsed.data === "memory" && !isDev)) {
    throw domainError("backend_not_configured");
  }
  return parsed.data;
}

// What the app (or a test) hands in: which backend, the opened database, secure
// storage, the network checker, a clock, and a fake network delay.
type AppServicesOptions = {
  backend: Backend;
  database: SqlDatabase;
  secure: SecureKeyValueStore;
  connectivity: ConnectivityService;
  now?: () => number;
  latencyMs?: number;
};

// Everything the app runs on, built once at startup.
export type AppServices = {
  services: Services;
  repositories: Repositories;
  // Recipe and meal plan sync. The app calls start() once the saved login is restored.
  syncEngine: SyncEngine;
  // Keeps the phone's copy of the ingredient catalog up to date. Started with syncEngine.
  ingredientEngine: IngredientRefreshEngine;
  // Failure injection, offline switch and clock for the in-memory backend; null otherwise.
  devControls: InMemoryServerControls | null;
};

// The services that talk to the server. These are the only ones that change between
// the in-memory backend and Firebase.
type Remote = {
  auth: AuthService;
  usernames: UsernameRegistry;
  remoteProfiles: RemoteProfileStore;
  remoteContent: RemoteUserContent;
  remoteStore: RemoteContentStore;
  ingredientSource: RemoteIngredientSource;
  devControls: InMemoryServerControls | null;
};

// What the server-side services need from createAppServices.
type RemoteOptions = {
  backend: Backend;
  // Where Firebase keeps its session: secure storage, never AsyncStorage (N-15).
  authStorage: ChunkedSecureStorage;
  connectivity: ConnectivityService;
  now: () => number;
  latencyMs: number;
};

// Builds the server-side services for the backend
function createRemote({ backend, authStorage, connectivity, now, latencyMs }: RemoteOptions): Remote {
  if (backend === "firebase") {
    // Loaded here, not at the top of this file, so with "memory" the Firebase SDK never
    // runs and nothing reads the Firebase variables.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createFirebaseRemote } = require("./firebase/firebaseRemote") as typeof import("./firebase/firebaseRemote");
    return { ...createFirebaseRemote({ authStorage, connectivity, now }), devControls: null };
  }
  const server = createInMemoryServer({ connectivity, latencyMs, now });
  return {
    auth: createInMemoryAuthService(server),
    usernames: createInMemoryUsernameRegistry(server),
    remoteProfiles: createInMemoryRemoteProfileStore(server),
    remoteContent: createInMemoryRemoteUserContent(server),
    remoteStore: createInMemoryRemoteContentStore(server),
    // A small made-up ingredient list (sampleIngredients.ts), not Edwin's data.
    ingredientSource: createInMemoryRemoteIngredientSource(server),
    devControls: server.controls,
  };
}

// Builds every repository and service and connects them together. Each piece gets the
// pieces it needs passed in (dependency injection), so nothing reaches out for its own.
export function createAppServices({
  backend,
  database,
  secure,
  connectivity,
  now = Date.now,
  latencyMs = 0,
}: AppServicesOptions): AppServices {
  // Local data stays real whichever backend is chosen: recipes, the meal plan, the
  // profile, the grocery list state and the ingredient catalog all live in the phone's
  // SQLite database (#1), even with the in-memory backend.
  const ingredients = createSqliteIngredientRepository(database);
  const repositories: Repositories = {
    recipes: createSqliteRecipeRepository(database, now),
    mealPlans: createSqliteMealPlanRepository(database, now),
    profiles: createSqliteProfileRepository(database, now),
    groceries: createSqliteGroceryRepository(database, now),
    // The last copy of the ingredient data downloaded to this phone (N-08), so the grocery
    // list can match rows and convert units offline and signed out. Empty (as before the
    // catalog existed) until a first download.
    ingredientCatalog: createIngredientCatalogStore(ingredients),
  };
  // Read the copy from the phone now, without waiting for it or for the network.
  void repositories.ingredientCatalog.load();

  // The 30-day session: where the login date is kept, and the rule that checks it. Built
  // first, because Firebase keeps its own session in this store's secure storage.
  const sessionStore = createSecureSessionStore(secure);
  const sessionPolicy = createSessionPolicy(now);
  const { auth, usernames, remoteProfiles, remoteContent, remoteStore, ingredientSource, devControls } = createRemote({
    backend,
    authStorage: sessionStore.authStorage,
    connectivity,
    now,
    latencyMs,
  });
  // What sync remembers on this phone: whose data it is and how far it has downloaded.
  const syncMeta = createSqliteSyncMetaStore(database);
  const sync = createSyncService({
    auth,
    remote: remoteStore,
    recipes: repositories.recipes,
    mealPlans: repositories.mealPlans,
    meta: syncMeta,
    connectivity,
    now,
  });
  // Downloads the shared ingredient data into the phone's copy. Separate from sync: it's a
  // read-only snapshot of reference data, not the user's content.
  const ingredientEngine = createIngredientRefresh({ auth, connectivity, source: ingredientSource, repository: ingredients, now });
  // Clears everything this phone keeps for the user (log out, account deletion). Not the
  // ingredient catalog: it's shared reference data, the same for every user, and keeping
  // it means the next user on this phone still has it offline.
  const localData = createLocalDataWiper([
    repositories.profiles,
    repositories.recipes,
    repositories.mealPlans,
    repositories.groceries,
    syncMeta,
  ]);

  return {
    services: {
      auth,
      usernames,
      remoteProfiles,
      remoteContent,
      sessionStore,
      sessionPolicy,
      sessionGuard: createSessionGuard({ auth, store: sessionStore, policy: sessionPolicy, wiper: localData, now }),
      sync,
      ingredientRefresh: ingredientEngine,
      connectivity,
      localData,
    },
    repositories,
    syncEngine: sync,
    ingredientEngine,
    devControls,
  };
}
