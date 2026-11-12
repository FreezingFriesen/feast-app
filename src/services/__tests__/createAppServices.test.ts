import { runMigrations } from "@/storage/migrations";
import { createFakeConnectivity } from "@/testing/fakes/fakeConnectivity";
import { createMemorySecureKeyValue } from "@/testing/fakes/memorySecureKeyValue";
import { createNodeSqliteDatabase } from "@/testing/nodeSqliteDatabase";
import type { Backend } from "@/validation/configSchema";
import { createAppServices, resolveBackend } from "../createAppServices";

// A pretend Firebase SDK. Each factory notes that it ran, so a test can prove which
// backend actually loaded the SDK.
jest.mock("firebase/app", () => {
  (globalThis as { firebaseSdkLoaded?: boolean }).firebaseSdkLoaded = true;
  return { getApps: jest.fn(() => []), getApp: jest.fn(), initializeApp: jest.fn(() => ({})) };
});
jest.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential: jest.fn() },
  getAuth: jest.fn(),
  getReactNativePersistence: jest.fn(() => ({})),
  initializeAuth: jest.fn(() => ({ currentUser: null })),
  onAuthStateChanged: jest.fn(),
}));
jest.mock("firebase/firestore", () => ({ getFirestore: jest.fn(), initializeFirestore: jest.fn(() => ({})) }));

// Read only inside the firebase tests: requiring these is what loads the pretend SDK.
const sdkLoaded = {
  get app() {
    return jest.requireMock<Record<string, jest.Mock>>("firebase/app");
  },
  get auth() {
    return jest.requireMock<Record<string, jest.Mock>>("firebase/auth");
  },
};

describe("resolveBackend", () => {
  it.each([
    [undefined, true, "memory"],
    ["memory", true, "memory"],
    ["firebase", true, "firebase"],
    ["firebase", false, "firebase"],
  ])("%p in dev=%p -> %p", (raw, isDev, expected) => {
    expect(resolveBackend(raw, isDev)).toBe(expected);
  });

  it.each([
    [undefined, false], // unset in a production build means memory, which is refused
    ["memory", false],
    ["Memory", true],
    ["sqlite", true],
    ["", true],
    ["memory ", true],
  ])("refuses %p in dev=%p", (raw, isDev) => {
    expect(() => resolveBackend(raw, isDev)).toThrow(
      expect.objectContaining({ name: "DomainError", code: "backend_not_configured" }),
    );
  });
});

async function setup(backend: Backend, database = createNodeSqliteDatabase()) {
  await runMigrations(database);
  const secure = createMemorySecureKeyValue();
  const app = createAppServices({
    backend,
    database,
    secure: secure.store,
    connectivity: createFakeConnectivity().service,
  });
  return { ...app, database, secureItems: secure.items };
}

const RECIPE = {
  title: "Pancakes",
  servings: 4,
  ingredients: [{ name: "Flour", quantity: 200, unit: "g" }],
  steps: ["Mix", "Cook"],
};

describe("createAppServices with the in-memory backend", () => {
  it("wires sign up, username claim, the SQLite profile, the session and the wipe together", async () => {
    const { services, repositories, devControls, secureItems } = await setup("memory");
    expect(devControls).not.toBeNull();

    const signUp = await services.auth.signUp({ email: "levi@example.com", password: "correct horse battery" });
    if (!signUp.ok) throw new Error(signUp.error);
    const claim = await services.usernames.claim(signUp.user.uid, "Levi_F");
    if (!claim.ok) throw new Error(claim.reason);
    expect(await repositories.profiles.mergeIncoming(signUp.user.uid, claim.profile)).toBe("applied");
    expect(await repositories.profiles.get(signUp.user.uid)).toMatchObject({ username: "levi_f" });

    await services.sessionGuard.startSession();
    expect(await services.sessionGuard.check()).toMatchObject({ state: "active" });
    expect(secureItems.has("feast.session.loginAt")).toBe(true);

    await services.localData.wipe();
    expect(await repositories.profiles.get(signUp.user.uid)).toBeUndefined();
  });

  it("keeps recipes and the meal plan in SQLite: they survive a restart, and the wipe clears them", async () => {
    const first = await setup("memory");
    const created = await first.repositories.recipes.create(RECIPE);
    if (!created.ok) throw new Error("Expected the recipe to be created");
    const added = await first.repositories.mealPlans.add({
      date: "2026-10-19",
      mealType: "dinner",
      recipeId: created.recipe.id,
      servings: 4,
    });
    if (!added.ok) throw new Error(added.reason);

    // A restart: the same database file, everything else built again.
    const restarted = await setup("memory", first.database);
    expect(await restarted.repositories.recipes.list()).toEqual([created.recipe]);
    expect(await restarted.repositories.mealPlans.getById(added.entry.id)).toEqual(added.entry);

    await restarted.services.localData.wipe();
    expect(await restarted.repositories.recipes.list()).toEqual([]);
    expect(await restarted.repositories.mealPlans.getById(added.entry.id)).toBeUndefined();
  });

  it("keeps grocery check marks and added items in SQLite: they survive a restart, and the wipe clears them", async () => {
    const first = await setup("memory");
    const week = "2026-11-09";
    expect(await first.repositories.groceries.setChecked(week, "name:flour|mass", true)).toEqual({ ok: true });
    const added = await first.repositories.groceries.addManualItem(week, { name: "Paper towels" });
    if (!added.ok) throw new Error(added.reason);

    const restarted = await setup("memory", first.database);
    expect(await restarted.repositories.groceries.listCheckedKeys(week)).toEqual(["name:flour|mass"]);
    expect(await restarted.repositories.groceries.listManualItems(week)).toEqual([added.item]);

    await restarted.services.localData.wipe();
    expect(await restarted.repositories.groceries.listCheckedKeys(week)).toEqual([]);
    expect(await restarted.repositories.groceries.listManualItems(week)).toEqual([]);
  });

  it("wires an empty ingredient catalog until the real one exists", async () => {
    const { repositories } = await setup("memory");
    expect(repositories.ingredientCatalog.find({ name: "Flour" })).toBeUndefined();
  });

  it("never loads the Firebase SDK or reads the Firebase values", async () => {
    await setup("memory");
    expect((globalThis as { firebaseSdkLoaded?: boolean }).firebaseSdkLoaded).toBeUndefined();
  });

  it("wires the sync engine: idle until started, then it uploads, and the wipe forgets its metadata", async () => {
    const { services, repositories, syncEngine, database } = await setup("memory");
    expect(services.sync).toBe(syncEngine);
    expect(services.sync.getStatus()).toMatchObject({ state: "unavailable", pendingChanges: 0 });

    const stop = syncEngine.start();
    const signUp = await services.auth.signUp({ email: "levi@example.com", password: "correct horse battery" });
    if (!signUp.ok) throw new Error(signUp.error);
    await repositories.recipes.create(RECIPE);
    expect(await services.sync.syncNow()).toMatchObject({ state: "idle", pendingChanges: 0, problem: null });
    expect(syncEngine.lastReport()).toMatchObject({ uploaded: 1 });

    const metaRows = () => database.raw.prepare("SELECT COUNT(*) AS count FROM sync_meta").get();
    expect(metaRows()).not.toEqual({ count: 0 });
    await services.localData.wipe();
    expect(metaRows()).toEqual({ count: 0 });
    stop();
  });
});

describe("createAppServices with the firebase backend", () => {
  const FIREBASE_VALUES = {
    EXPO_PUBLIC_FIREBASE_API_KEY: "test-api-key_0123456789",
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "feast-demo.firebaseapp.com",
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: "feast-demo",
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: "feast-demo.firebasestorage.app",
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456789012",
    EXPO_PUBLIC_FIREBASE_APP_ID: "1:123456789012:web:abcdef0123456789",
  };
  // Changed in place, not replaced: Expo's env module keeps hold of the original object.
  afterEach(() => {
    for (const name of Object.keys(FIREBASE_VALUES)) delete process.env[name];
  });

  it("fails with backend_not_configured when the Firebase values are missing, before connecting", async () => {
    for (const name of Object.keys(FIREBASE_VALUES)) delete process.env[name];
    await expect(setup("firebase")).rejects.toMatchObject({ name: "DomainError", code: "backend_not_configured" });
    expect(sdkLoaded.app.initializeApp).not.toHaveBeenCalled();
  });

  it("keeps Firebase's session in the session store's secure storage, and has no dev controls", async () => {
    Object.assign(process.env, FIREBASE_VALUES);
    const { services, devControls } = await setup("firebase");
    expect(devControls).toBeNull();
    expect(sdkLoaded.auth.getReactNativePersistence).toHaveBeenCalledTimes(1);
    expect(sdkLoaded.auth.getReactNativePersistence.mock.calls[0][0]).toBe(services.sessionStore.authStorage);
  });
});
