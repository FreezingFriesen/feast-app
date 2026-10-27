// The composition root: the only place that picks implementations.
import { createInMemoryMealPlanRepository } from "@/repositories/inMemoryMealPlanRepository";
import { createInMemoryRecipeRepository } from "@/repositories/inMemoryRecipeRepository";
import type { Repositories } from "@/repositories/RepositoryProvider";
import { createSqliteProfileRepository } from "@/repositories/sqliteProfileRepository";
import type { SqlDatabase } from "@/storage/SqlDatabase";
import { backendSchema, type Backend } from "@/validation/configSchema";
import { createLocalDataWiper } from "./account/LocalDataWiper";
import type { AuthService } from "./auth/AuthService";
import { createFirebaseAuthService } from "./auth/firebaseAuthService";
import { createInMemoryAuthService } from "./auth/inMemoryAuthService";
import { createInMemoryServer, type InMemoryServerControls } from "./backend/inMemoryServer";
import type { ConnectivityService } from "./connectivity/ConnectivityService";
import { domainError } from "./domainErrors";
import { createFirebaseRemoteProfileStore } from "./profiles/firebaseRemoteProfileStore";
import { createInMemoryRemoteProfileStore } from "./profiles/inMemoryRemoteProfileStore";
import type { RemoteProfileStore } from "./profiles/RemoteProfileStore";
import type { Services } from "./ServiceProvider";
import { createSecureSessionStore } from "./session/SecureSessionStore";
import type { SecureKeyValueStore } from "./session/secureKeyValue";
import { createSessionGuard } from "./session/sessionGuard";
import { createSessionPolicy } from "./session/SessionPolicy";
import { createStubSyncService } from "./sync/stubSyncService";
import { createFirebaseRemoteUserContent } from "./userData/firebaseRemoteUserContent";
import { createInMemoryRemoteUserContent } from "./userData/inMemoryRemoteUserContent";
import type { RemoteUserContent } from "./userData/RemoteUserContent";
import { createFirebaseUsernameRegistry } from "./usernames/firebaseUsernameRegistry";
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

type AppServicesOptions = {
  backend: Backend;
  database: SqlDatabase;
  secure: SecureKeyValueStore;
  connectivity: ConnectivityService;
  now?: () => number;
  latencyMs?: number;
};

export type AppServices = {
  services: Services;
  repositories: Repositories;
  // Failure injection, offline switch and clock for the in-memory backend; null otherwise.
  devControls: InMemoryServerControls | null;
};

type Remote = {
  auth: AuthService;
  usernames: UsernameRegistry;
  remoteProfiles: RemoteProfileStore;
  remoteContent: RemoteUserContent;
  devControls: InMemoryServerControls | null;
};

function createRemote(backend: Backend, connectivity: ConnectivityService, now: () => number, latencyMs: number): Remote {
  if (backend === "firebase") {
    return {
      auth: createFirebaseAuthService(),
      usernames: createFirebaseUsernameRegistry(),
      remoteProfiles: createFirebaseRemoteProfileStore(),
      remoteContent: createFirebaseRemoteUserContent(),
      devControls: null,
    };
  }
  const server = createInMemoryServer({ connectivity, latencyMs, now });
  return {
    auth: createInMemoryAuthService(server),
    usernames: createInMemoryUsernameRegistry(server),
    remoteProfiles: createInMemoryRemoteProfileStore(server),
    remoteContent: createInMemoryRemoteUserContent(server),
    devControls: server.controls,
  };
}

export function createAppServices({
  backend,
  database,
  secure,
  connectivity,
  now = Date.now,
  latencyMs = 0,
}: AppServicesOptions): AppServices {
  // Local data stays real whichever backend is chosen. Recipes and meal plans move to
  // SQLite with #1.
  const repositories: Repositories = {
    recipes: createInMemoryRecipeRepository(now),
    mealPlans: createInMemoryMealPlanRepository(now),
    profiles: createSqliteProfileRepository(database, now),
  };

  const { auth, usernames, remoteProfiles, remoteContent, devControls } = createRemote(
    backend,
    connectivity,
    now,
    latencyMs,
  );
  const sessionStore = createSecureSessionStore(secure);
  const sessionPolicy = createSessionPolicy(now);
  const localData = createLocalDataWiper([repositories.profiles, repositories.recipes, repositories.mealPlans]);

  return {
    services: {
      auth,
      usernames,
      remoteProfiles,
      remoteContent,
      sessionStore,
      sessionPolicy,
      sessionGuard: createSessionGuard({ auth, store: sessionStore, policy: sessionPolicy, wiper: localData, now }),
      sync: createStubSyncService(),
      connectivity,
      localData,
    },
    repositories,
    devControls,
  };
}
