import type { MealPlanEntry, MealPlanWriteResult } from "@/repositories/MealPlanRepository";
import { createInMemoryProfileRepository } from "@/repositories/inMemoryProfileRepository";
import type { CreateRecipeResult, Recipe } from "@/repositories/RecipeRepository";
import { createAccountDeleter } from "@/services/account/AccountDeleter";
import { createLocalDataWiper } from "@/services/account/LocalDataWiper";
import { createSignUpFlow } from "@/services/account/signUpFlow";
import { createInMemoryRemoteProfileStore } from "@/services/profiles/inMemoryRemoteProfileStore";
import { createSecureSessionStore } from "@/services/session/SecureSessionStore";
import { createSessionGuard } from "@/services/session/sessionGuard";
import { createSessionPolicy } from "@/services/session/SessionPolicy";
import type { SyncService } from "@/services/sync/SyncService";
import type { RemoteContentStore } from "@/services/userData/RemoteContentStore";
import { hasAllowedKeys, toRemoteDocument } from "@/services/userData/remoteDocuments";
import { createInMemoryRemoteUserContent } from "@/services/userData/inMemoryRemoteUserContent";
import { createInMemoryUsernameRegistry } from "@/services/usernames/inMemoryUsernameRegistry";
import { createMemorySecureKeyValue } from "@/testing/fakes/memorySecureKeyValue";
import { entryDocument, RECIPE_FORM_INPUT, recipeDocument } from "@/testing/syncFixtures";
import {
  createSyncDevice,
  createSyncWorld,
  PASSWORD,
  plantDocument,
  serverDocuments,
  settle,
  type SyncDevice,
  type SyncWorld,
} from "@/testing/syncTestBed";

const EMAIL = "levi@example.com";
const OTHER_EMAIL = "zane@example.com";
const HOUR = 60 * 60 * 1000;
const ENTRY_INPUT = { date: "2026-10-19", mealType: "dinner", servings: 4 } as const;
const WHOLE_RANGE = ["2000-01-01", "2100-12-31"] as const;

function expectCreated(result: CreateRecipeResult): Recipe {
  if (!result.ok) throw new Error("Expected the recipe to be created");
  return result.recipe;
}

function expectAdded(result: MealPlanWriteResult): MealPlanEntry {
  if (!result.ok) throw new Error(`Expected ok, got ${result.reason}`);
  return result.entry;
}

// A promise the test resolves when it is ready, to hold a sync at one point.
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

async function onePhone() {
  const world = createSyncWorld();
  const phone = await createSyncDevice(world);
  const uid = await phone.signUp(EMAIL);
  return { world, phone, uid };
}

async function twoPhones() {
  const world = createSyncWorld();
  const a = await createSyncDevice(world);
  const b = await createSyncDevice(world);
  const uid = await a.signUp(EMAIL);
  await b.signIn(EMAIL);
  return { world, a, b, uid };
}

const titleOn = async (phone: SyncDevice, id: string) => (await phone.recipes.getById(id))?.title;

describe("two phones on one account", () => {
  it("restores everything on a new phone, validated, with progress", async () => {
    const { world, a, b, uid } = await twoPhones();
    const recipes: Recipe[] = [];
    for (const title of ["One", "Two", "Three"]) {
      recipes.push(expectCreated(await a.recipes.create({ ...RECIPE_FORM_INPUT, title })));
      world.advance();
    }
    const entry = expectAdded(await a.mealPlans.add({ ...ENTRY_INPUT, recipeId: recipes[0].id }));

    expect(await a.sync.syncNow()).toMatchObject({
      state: "idle",
      pendingChanges: 0,
      lastSyncedAt: world.now(),
      problem: null,
    });
    expect(serverDocuments(world, uid, "recipes").size).toBe(3);

    const progress: unknown[] = [];
    b.sync.subscribe(() => progress.push(b.sync.getStatus().restore));
    expect(await b.sync.syncNow()).toMatchObject({ state: "idle", restore: null, pendingChanges: 0 });
    expect(progress).toContainEqual({ completed: 0, total: 4 });
    expect(progress).toContainEqual({ completed: 4, total: 4 });
    expect(await b.recipes.list()).toEqual(await a.recipes.list());
    expect(await b.mealPlans.getById(entry.id)).toEqual(entry);
    expect(b.sync.lastReport()).toEqual({ downloaded: 4, applied: 4, skipped: 0, uploaded: 0, rejected: 0 });
  });

  it("an edit on either phone reaches the other", async () => {
    const { world, a, b } = await twoPhones();
    const recipe = expectCreated(await a.recipes.create(RECIPE_FORM_INPUT));
    await a.sync.syncNow();
    await b.sync.syncNow();

    world.advance();
    await b.recipes.update(recipe.id, { ...RECIPE_FORM_INPUT, title: "Edited on B" });
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect(await titleOn(a, recipe.id)).toBe("Edited on B");

    world.advance();
    const entry = expectAdded(await a.mealPlans.add({ ...ENTRY_INPUT, recipeId: recipe.id }));
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(await b.mealPlans.getById(entry.id)).toEqual(entry);
    expect(a.sync.getStatus()).toMatchObject({ state: "idle", pendingChanges: 0 });
    expect(b.sync.getStatus()).toMatchObject({ state: "idle", pendingChanges: 0 });
  });

  it("when both phones edit, the later edit wins on both, whichever syncs first", async () => {
    const { world, a, b } = await twoPhones();
    const { id } = expectCreated(await a.recipes.create(RECIPE_FORM_INPUT));
    await a.sync.syncNow();
    await b.sync.syncNow();

    // B's edit is later, but A syncs first.
    world.advance(10);
    await a.recipes.update(id, { ...RECIPE_FORM_INPUT, title: "From A" });
    world.advance(10);
    await b.recipes.update(id, { ...RECIPE_FORM_INPUT, title: "From B" });
    await a.sync.syncNow();
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect([await titleOn(a, id), await titleOn(b, id)]).toEqual(["From B", "From B"]);

    // Now A's edit is later, but B syncs first.
    world.advance(10);
    await b.recipes.update(id, { ...RECIPE_FORM_INPUT, title: "From B again" });
    world.advance(10);
    await a.recipes.update(id, { ...RECIPE_FORM_INPUT, title: "From A again" });
    await b.sync.syncNow();
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect([await titleOn(a, id), await titleOn(b, id)]).toEqual(["From A again", "From A again"]);
    expect([a.sync.getStatus().problem, b.sync.getStatus().problem]).toEqual([null, null]);
  });

  it("still gets a change from a phone whose clock is behind (up to the overlap window)", async () => {
    const world = createSyncWorld();
    const a = await createSyncDevice(world);
    // B's clock is 30 minutes slow, so its changes look older than ones A already has.
    const b = await createSyncDevice(world, { clockOffsetMs: -30 * 60 * 1000 });
    await a.signUp(EMAIL);
    await b.signIn(EMAIL);
    expectCreated(await a.recipes.create({ ...RECIPE_FORM_INPUT, title: "From A" }));
    // The second sync downloads A's own upload, so A's high-water mark is now "now".
    await a.sync.syncNow();
    await a.sync.syncNow();
    expect((await a.meta.read()).highWater.recipes).toBe(world.now());
    await b.sync.syncNow();

    world.advance();
    const fromB = expectCreated(await b.recipes.create({ ...RECIPE_FORM_INPUT, title: "From the slow phone" }));
    expect(fromB.updatedAt).toBeLessThan((await a.meta.read()).highWater.recipes!);
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect(await titleOn(a, fromB.id)).toBe("From the slow phone");
  });

  it("on a tie (the same millisecond) each phone keeps its own copy", async () => {
    const { a, b } = await twoPhones();
    const { id } = expectCreated(await a.recipes.create(RECIPE_FORM_INPUT));
    await a.sync.syncNow();
    await b.sync.syncNow();

    await a.recipes.update(id, { ...RECIPE_FORM_INPUT, title: "Tie from A" });
    await b.recipes.update(id, { ...RECIPE_FORM_INPUT, title: "Tie from B" });
    await a.sync.syncNow();
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect([await titleOn(a, id), await titleOn(b, id)]).toEqual(["Tie from A", "Tie from B"]);
  });

  it("a delete reaches the other phone, and no other copy brings it back", async () => {
    const { world, a, b, uid } = await twoPhones();
    const recipe = expectCreated(await a.recipes.create(RECIPE_FORM_INPUT));
    await a.sync.syncNow();
    await b.sync.syncNow();

    world.advance();
    await a.recipes.remove(recipe.id);
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(await b.recipes.getById(recipe.id)).toBeUndefined();
    expect(await b.recipes.list()).toEqual([]);

    // Live copies on the server (the Rules forbid this; planted to prove the phone holds firm).
    for (const updatedAt of [recipe.updatedAt, world.now() + 1_000]) {
      plantDocument(world, uid, "recipes", recipe.id, recipeDocument(updatedAt, { createdAt: recipe.createdAt }));
      world.advance(2_000);
      await b.sync.syncNow();
      expect(await b.recipes.getById(recipe.id)).toBeUndefined();
    }
  });

  it("a delete on one phone beats a later edit on the other, and nothing gets stuck", async () => {
    const { world, a, b } = await twoPhones();
    const { id } = expectCreated(await a.recipes.create(RECIPE_FORM_INPUT));
    await a.sync.syncNow();
    await b.sync.syncNow();

    world.advance(10);
    await a.recipes.remove(id);
    world.advance(10);
    await b.recipes.update(id, { ...RECIPE_FORM_INPUT, title: "Edited after the delete" });
    await a.sync.syncNow();
    expect(await b.sync.syncNow()).toMatchObject({ state: "idle", pendingChanges: 0, problem: null });
    expect(await b.recipes.getById(id)).toBeUndefined();
  });
});

describe("offline", () => {
  it("counts changes made offline, keeps working locally, and uploads them when back online", async () => {
    const { world, phone, uid } = await onePhone();
    const stop = phone.sync.start();
    await settle();

    phone.connectivity.setOnline(false);
    await settle();
    const recipe = expectCreated(await phone.recipes.create(RECIPE_FORM_INPUT));
    await phone.recipes.update(recipe.id, { ...RECIPE_FORM_INPUT, title: "Edited offline" });
    expectAdded(await phone.mealPlans.add({ ...ENTRY_INPUT, recipeId: recipe.id }));
    await phone.runScheduled();

    expect(phone.sync.getStatus()).toMatchObject({ state: "offline", pendingChanges: 2 });
    expect(await titleOn(phone, recipe.id)).toBe("Edited offline");
    expect(serverDocuments(world, uid, "recipes").size).toBe(0);

    phone.connectivity.setOnline(true);
    await settle();
    expect(phone.sync.getStatus()).toMatchObject({ state: "idle", pendingChanges: 0 });
    expect(serverDocuments(world, uid, "recipes").get(recipe.id)).toMatchObject({ title: "Edited offline" });
    expect(serverDocuments(world, uid, "mealPlanEntries").size).toBe(1);
    stop();
  });

  it("reports offline when the server can't be reached, and catches up later", async () => {
    const { world, phone, uid } = await onePhone();
    expectCreated(await phone.recipes.create(RECIPE_FORM_INPUT));
    world.server.controls.setOffline(true);
    expect(await phone.sync.syncNow()).toMatchObject({ state: "offline", pendingChanges: 1 });
    world.server.controls.setOffline(false);
    expect(await phone.sync.syncNow()).toMatchObject({ state: "idle", pendingChanges: 0 });
    expect(serverDocuments(world, uid, "recipes").size).toBe(1);
  });
});

it("an edit made during an upload stays pending, and the follow-up sync uploads it", async () => {
  const world = createSyncWorld();
  let recipeId = "";
  let edited = false;
  const phone: SyncDevice = await createSyncDevice(world, {
    wrapRemote: (remote): RemoteContentStore => ({
      ...remote,
      async upsertMany(uid, collection, records) {
        const results = await remote.upsertMany(uid, collection, records);
        if (collection === "recipes" && !edited) {
          edited = true;
          world.advance();
          await phone.recipes.update(recipeId, { ...RECIPE_FORM_INPUT, title: "Edited mid-upload" });
        }
        return results;
      },
    }),
  });
  const uid = await phone.signUp(EMAIL);
  const stop = phone.sync.start();
  await settle();

  recipeId = expectCreated(await phone.recipes.create(RECIPE_FORM_INPUT)).id;
  await phone.runScheduled();
  expect(serverDocuments(world, uid, "recipes").get(recipeId)).toMatchObject({ title: RECIPE_FORM_INPUT.title });
  expect(await phone.recipes.pendingCount()).toBe(1);
  expect(phone.scheduledCount()).toBe(1);

  await phone.runScheduled();
  expect(serverDocuments(world, uid, "recipes").get(recipeId)).toMatchObject({ title: "Edited mid-upload" });
  expect(await phone.recipes.pendingCount()).toBe(0);
  stop();
});

describe("records that can't sync", () => {
  it("a record the server refuses is reported, the others still upload, and it goes once the clock is right", async () => {
    const { world, phone, uid } = await onePhone();
    const first = expectCreated(await phone.recipes.create({ ...RECIPE_FORM_INPUT, title: "First" }));
    // Made while the phone's clock was a day fast: the Rules refuse timestamps that far ahead.
    phone.setClockOffset(24 * HOUR);
    const fromTheFuture = expectCreated(await phone.recipes.create({ ...RECIPE_FORM_INPUT, title: "Future" }));
    phone.setClockOffset(0);
    const entry = expectAdded(await phone.mealPlans.add({ ...ENTRY_INPUT, recipeId: first.id }));

    expect(await phone.sync.syncNow()).toMatchObject({
      state: "error",
      problem: { kind: "rejected", count: 1 },
      pendingChanges: 1,
      lastSyncedAt: null,
    });
    expect([...serverDocuments(world, uid, "recipes").keys()]).toEqual([first.id]);
    expect([...serverDocuments(world, uid, "mealPlanEntries").keys()]).toEqual([entry.id]);

    world.advance(24 * HOUR);
    expect(await phone.sync.syncNow()).toMatchObject({ state: "idle", problem: null, pendingChanges: 0 });
    expect(serverDocuments(world, uid, "recipes").has(fromTheFuture.id)).toBe(true);
  });

  it("skips invalid documents from the server and counts them; nothing from them is stored", async () => {
    const { world, phone, uid } = await onePhone();
    const t = world.now() - 60_000;
    plantDocument(world, uid, "recipes", "good", recipeDocument(t));
    plantDocument(world, uid, "recipes", "Bad ID", recipeDocument(t));
    plantDocument(world, uid, "recipes", "wrong-shape", { ...recipeDocument(t), title: 5 });
    plantDocument(world, uid, "recipes", "attack", { ...recipeDocument(t), title: "'; DROP TABLE recipes;--" });
    plantDocument(world, uid, "recipes", "oversized", { ...recipeDocument(t), steps: Array(51).fill("Stir") });
    plantDocument(world, uid, "recipes", "too-long", { ...recipeDocument(t), description: "a".repeat(501) });
    plantDocument(world, uid, "recipes", "extra-key", { ...recipeDocument(t), isAdmin: true });
    plantDocument(world, uid, "mealPlanEntries", "bad-date", entryDocument(t, { date: "2026-02-30" }));

    expect(await phone.sync.syncNow()).toMatchObject({ state: "idle", problem: null });
    expect((await phone.recipes.list()).map((recipe) => recipe.id).sort()).toEqual(["extra-key", "good"]);
    expect(await phone.recipes.getById("extra-key")).not.toHaveProperty("isAdmin");
    expect(await phone.mealPlans.listBetween(...WHOLE_RANGE)).toEqual([]);
    expect(phone.sync.lastReport()).toMatchObject({ downloaded: 8, applied: 2, skipped: 6 });
  });
});

it("restores more than 1,200 records page by page, even when hundreds share an updatedAt", async () => {
  const { world, phone, uid } = await onePhone();
  const t = world.now() - HOUR / 2;
  for (let i = 0; i < 1_201; i += 1) {
    plantDocument(world, uid, "recipes", `r-${String(i).padStart(4, "0")}`, recipeDocument(i < 600 ? t : t + i));
  }
  const progress: unknown[] = [];
  phone.sync.subscribe(() => progress.push(phone.sync.getStatus().restore));

  expect(await phone.sync.syncNow()).toMatchObject({ state: "idle", restore: null });
  expect(await phone.recipes.list()).toHaveLength(1_201);
  expect(progress).toContainEqual({ completed: 1_201, total: 1_201 });
  expect((await phone.meta.read()).highWater.recipes).toBe(t + 1_200);

  // The next sync re-reads only the overlap window and changes nothing.
  await phone.sync.syncNow();
  expect(phone.sync.lastReport()).toMatchObject({ applied: 0, skipped: 0 });
});

describe("one sync at a time, and stopping", () => {
  it("calls during a sync share it", async () => {
    const world = createSyncWorld();
    let fetches = 0;
    const phone = await createSyncDevice(world, {
      wrapRemote: (remote) => ({
        ...remote,
        fetchChanges: (...args) => {
          fetches += 1;
          return remote.fetchChanges(...args);
        },
      }),
    });
    await phone.signUp(EMAIL);
    const calls = [phone.sync.syncNow(), phone.sync.syncNow(), phone.sync.syncNow()];
    expect(calls[1]).toBe(calls[0]);
    expect(calls[2]).toBe(calls[0]);
    await Promise.all(calls);
    expect(fetches).toBe(2); // one page of each collection
  });

  it("signing out stops a sync in progress: nothing more is merged or uploaded", async () => {
    const world = createSyncWorld();
    const held = gate();
    const phone = await createSyncDevice(world, {
      wrapRemote: (remote) => ({
        ...remote,
        async fetchChanges(...args) {
          const result = await remote.fetchChanges(...args);
          await held.promise;
          return result;
        },
      }),
    });
    const uid = await phone.signUp(EMAIL);
    plantDocument(world, uid, "recipes", "on-server", recipeDocument(world.now() - 1_000));
    const local = expectCreated(await phone.recipes.create(RECIPE_FORM_INPUT));
    const stop = phone.sync.start();
    await settle();

    await phone.auth.signOut();
    held.open();
    await settle();
    expect(await phone.recipes.getById("on-server")).toBeUndefined();
    expect(serverDocuments(world, uid, "recipes").has(local.id)).toBe(false);
    expect(phone.sync.getStatus()).toMatchObject({ state: "unavailable" });
    stop();
  });

  it("when the user changes during a sync, nothing is uploaded to either account", async () => {
    const world = createSyncWorld();
    const other = await createSyncDevice(world);
    const otherUid = await other.signUp(OTHER_EMAIL);
    await other.auth.signOut();

    let swapped = false;
    const phone: SyncDevice = await createSyncDevice(world, {
      wrapRemote: (remote) => ({
        ...remote,
        async fetchChanges(uid, collection, options) {
          const result = await remote.fetchChanges(uid, collection, options);
          if (collection === "mealPlanEntries" && !swapped) {
            swapped = true;
            await phone.auth.signOut();
            await phone.signIn(OTHER_EMAIL);
          }
          return result;
        },
      }),
    });
    const uid = await phone.signUp(EMAIL);
    expectCreated(await phone.recipes.create(RECIPE_FORM_INPUT));

    await phone.sync.syncNow();
    expect(serverDocuments(world, uid, "recipes").size).toBe(0);
    expect(serverDocuments(world, otherUid, "recipes").size).toBe(0);
    expect(await phone.recipes.pendingCount()).toBe(1);
  });

  it("stop() pauses sync until the user signs out and in again", async () => {
    const { world, phone, uid } = await onePhone();
    const stopListening = phone.sync.start();
    await settle();

    await phone.sync.stop();
    expect(phone.sync.getStatus()).toMatchObject({ state: "unavailable" });
    expectCreated(await phone.recipes.create(RECIPE_FORM_INPUT));
    await settle();
    expect(phone.scheduledCount()).toBe(0);
    expect(await phone.sync.syncNow()).toMatchObject({ state: "unavailable" });
    expect(serverDocuments(world, uid, "recipes").size).toBe(0);

    await phone.auth.signOut();
    await phone.signIn(EMAIL);
    await settle();
    expect(serverDocuments(world, uid, "recipes").size).toBe(1);
    stopListening();
  });
});

describe("account deletion during a sync", () => {
  // A full account (username and profile) on this phone, and a deleter wired as in
  // useAccountFlows, with the phone's sync engine (or a stand-in for its stop()).
  // beforeRelease runs between deleting the content and releasing the username.
  async function deletableAccount(
    world: SyncWorld,
    phone: SyncDevice,
    { sync = phone.sync, beforeRelease }: { sync?: Pick<SyncService, "stop">; beforeRelease?: () => Promise<void> } = {},
  ) {
    const registry = createInMemoryUsernameRegistry(world.server);
    const usernames = {
      ...registry,
      release: async (...args: Parameters<typeof registry.release>) => {
        await beforeRelease?.();
        return registry.release(...args);
      },
    };
    const remoteProfiles = createInMemoryRemoteProfileStore(world.server);
    const remoteContent = createInMemoryRemoteUserContent(world.server);
    const profiles = createInMemoryProfileRepository(world.now);
    const store = createSecureSessionStore(createMemorySecureKeyValue().store);
    const localData = createLocalDataWiper([profiles, phone.recipes, phone.mealPlans, phone.meta]);
    const sessionGuard = createSessionGuard({
      auth: phone.auth,
      store,
      policy: createSessionPolicy(world.now),
      wiper: localData,
      now: world.now,
    });
    const signUp = createSignUpFlow({ auth: phone.auth, usernames, profiles, sessionGuard });
    const form = { email: EMAIL, username: "levi_f", password: PASSWORD, confirmPassword: PASSWORD };
    expect(await signUp.signUp(form)).toEqual({ status: "signed_up" });
    const deleter = createAccountDeleter({
      auth: phone.auth,
      usernames,
      remoteProfiles,
      remoteContent,
      profiles,
      sessionGuard,
      localData,
      sync,
    });
    return {
      uid: phone.auth.currentUser()!.uid,
      deleteAccount: () => deleter.deleteAccount({ password: PASSWORD, confirmation: "levi_f" }),
    };
  }

  it("deletion stops sync first, so it can't upload between deleting the content and deleting the login", async () => {
    const world = createSyncWorld();
    const held = gate();
    let uploads = 0;
    const phone = await createSyncDevice(world, {
      wrapRemote: (remote) => ({
        ...remote,
        async fetchChanges(...args) {
          await held.promise;
          return remote.fetchChanges(...args);
        },
        upsertMany: (...args) => {
          uploads += 1;
          return remote.upsertMany(...args);
        },
      }),
    });
    const { uid, deleteAccount } = await deletableAccount(world, phone, {
      // The held sync carries on as soon as deletion stops it...
      sync: {
        stop: async () => {
          held.open();
          await phone.sync.stop();
        },
      },
      // ...or, if deletion didn't stop it, while the username is released: the user is
      // still signed in then, so an upload would recreate the content just deleted.
      beforeRelease: async () => {
        held.open();
        await settle();
      },
    });
    expectCreated(await phone.recipes.create(RECIPE_FORM_INPUT));

    const running = phone.sync.syncNow();
    await settle();
    expect(await deleteAccount()).toEqual({ ok: true });
    await running;
    await settle();
    expect(uploads).toBe(0);
    expect(world.server.state.userContent.has(uid)).toBe(false);
  });

  it("an upload already on its way lands before the content is deleted, so nothing is left", async () => {
    const world = createSyncWorld();
    const held = gate();
    const phone = await createSyncDevice(world, {
      wrapRemote: (remote) => ({
        ...remote,
        async upsertMany(...args) {
          await held.promise;
          return remote.upsertMany(...args);
        },
      }),
    });
    const { uid, deleteAccount } = await deletableAccount(world, phone);
    expectCreated(await phone.recipes.create(RECIPE_FORM_INPUT));

    const running = phone.sync.syncNow();
    await settle();
    const deletion = deleteAccount();
    await settle();
    held.open();
    expect(await deletion).toEqual({ ok: true });
    await running;
    await phone.sync.syncNow();
    await settle();
    expect(world.server.state.userContent.has(uid)).toBe(false);
  });
});

describe("whose data is it", () => {
  it("recipes made while signed out are adopted by the first user who signs in", async () => {
    const world = createSyncWorld();
    const phone = await createSyncDevice(world);
    const recipe = expectCreated(await phone.recipes.create(RECIPE_FORM_INPUT));
    expect(await phone.sync.syncNow()).toMatchObject({ state: "unavailable" });

    const uid = await phone.signUp(EMAIL);
    expect(await phone.sync.syncNow()).toMatchObject({ state: "idle", pendingChanges: 0 });
    expect(serverDocuments(world, uid, "recipes").has(recipe.id)).toBe(true);
    expect((await phone.meta.read()).ownerUid).toBe(uid);
  });

  it("another account's data on this phone is never uploaded, and nothing is merged into it", async () => {
    const { world, phone, uid } = await onePhone();
    expectCreated(await phone.recipes.create(RECIPE_FORM_INPUT));
    await phone.sync.syncNow();
    // Signed out without the wipe (as after a session expiry), then someone else signs in.
    await phone.auth.signOut();
    const other = await createSyncDevice(world);
    const otherUid = await other.signUp(OTHER_EMAIL);
    await other.auth.signOut();
    await phone.signIn(OTHER_EMAIL);
    plantDocument(world, otherUid, "recipes", "theirs", recipeDocument(world.now() - 1_000));
    expectCreated(await phone.recipes.create({ ...RECIPE_FORM_INPUT, title: "Made by the second user" }));

    expect(await phone.sync.syncNow()).toMatchObject({ state: "error", problem: { kind: "other_account" } });
    expect([...serverDocuments(world, otherUid, "recipes").keys()]).toEqual(["theirs"]);
    expect(await phone.recipes.getById("theirs")).toBeUndefined();
    expect(serverDocuments(world, uid, "recipes").size).toBe(1);
  });
});

describe("what is uploaded", () => {
  it("builds documents from the allowed keys only: no id, no local fields, no undefined", () => {
    const t = Date.UTC(2026, 9, 1);
    const recipe = toRemoteDocument("recipes", {
      ...recipeDocument(t, { description: "Fluffy", notes: undefined, deletedAt: t }),
      ingredients: [{ name: "Flour", quantity: 200, unit: "g", note: "sifted", rawText: "200 g flour", ingredientId: undefined }],
      id: "abc",
      dirty: 1,
      isAdmin: true,
    });
    expect(recipe).toStrictEqual({
      ...recipeDocument(t, { description: "Fluffy", deletedAt: t }),
      ingredients: [{ name: "Flour", quantity: 200, unit: "g", note: "sifted" }],
    });
    expect(hasAllowedKeys("recipes", recipe)).toBe(true);

    const entry = toRemoteDocument("mealPlanEntries", { ...entryDocument(t), id: "e1", dirty: 0 });
    expect(entry).toStrictEqual(entryDocument(t));
    expect(hasAllowedKeys("mealPlanEntries", entry)).toBe(true);
    expect(hasAllowedKeys("mealPlanEntries", { ...entry, id: "e1" })).toBe(false);
    const { recipeId: _dropped, ...missing } = entry;
    expect(hasAllowedKeys("mealPlanEntries", missing)).toBe(false);
  });

  it("what the server stores is exactly what the phone had, key for key", async () => {
    const { world, phone, uid } = await onePhone();
    const recipe = expectCreated(
      await phone.recipes.create({
        ...RECIPE_FORM_INPUT,
        description: "Flaky crust",
        prepTimeMinutes: 20,
        notes: undefined,
        mealTypes: ["dinner"],
        dietTags: ["vegetarian"],
        ingredients: [{ name: "Apples", quantity: 6, unit: "piece", note: "tart" }],
      }),
    );
    const entry = expectAdded(await phone.mealPlans.add({ ...ENTRY_INPUT, recipeId: recipe.id }));
    await phone.mealPlans.remove(entry.id);
    const pending = [...(await phone.recipes.listPending(10)), ...(await phone.mealPlans.listPending(10))];

    await phone.sync.syncNow();
    const stored = [serverDocuments(world, uid, "recipes").get(recipe.id), serverDocuments(world, uid, "mealPlanEntries").get(entry.id)];
    expect(stored).toStrictEqual(pending.map((record) => record.data));
    expect(stored[1]).toHaveProperty("deletedAt");
    expect(hasAllowedKeys("recipes", stored[0]!)).toBe(true);
    expect(hasAllowedKeys("mealPlanEntries", stored[1]!)).toBe(true);
  });
});

describe("when sync runs", () => {
  it("after a saved login is found at start, after signing in, and not while signed out", async () => {
    const { world, phone, uid } = await onePhone();
    expectCreated(await phone.recipes.create(RECIPE_FORM_INPUT));
    const stop = phone.sync.start();
    await settle();
    expect(serverDocuments(world, uid, "recipes").size).toBe(1);
    expect(phone.sync.getStatus()).toMatchObject({ state: "idle" });

    await phone.auth.signOut();
    expect(phone.sync.getStatus()).toMatchObject({ state: "unavailable", pendingChanges: 0 });
    expectCreated(await phone.recipes.create(RECIPE_FORM_INPUT));
    await settle();
    expect(phone.scheduledCount()).toBe(0);

    await phone.signIn(EMAIL);
    await settle();
    expect(serverDocuments(world, uid, "recipes").size).toBe(2);
    stop();
  });

  it("shortly after local changes, once for a burst of edits", async () => {
    const { world, phone, uid } = await onePhone();
    const stop = phone.sync.start();
    await settle();
    for (const title of ["One", "Two", "Three"]) {
      expectCreated(await phone.recipes.create({ ...RECIPE_FORM_INPUT, title }));
    }
    await settle();
    expect(phone.scheduledCount()).toBe(1);
    expect(phone.sync.getStatus().pendingChanges).toBe(3);

    await phone.runScheduled();
    expect(serverDocuments(world, uid, "recipes").size).toBe(3);
    expect(phone.scheduledCount()).toBe(0);
    stop();
  });

  it("not again because of its own downloads", async () => {
    const { world, phone, uid } = await onePhone();
    plantDocument(world, uid, "recipes", "r1", recipeDocument(world.now() - 1_000));
    const stop = phone.sync.start();
    await settle();
    expect(await phone.recipes.getById("r1")).toBeDefined();
    expect(phone.scheduledCount()).toBe(0);
    stop();
  });

  it("stops listening when the app stops it", async () => {
    const { phone } = await onePhone();
    const stop = phone.sync.start();
    await settle();
    stop();
    expectCreated(await phone.recipes.create(RECIPE_FORM_INPUT));
    await settle();
    expect(phone.scheduledCount()).toBe(0);
  });

  it("keeps the same status object until something changes", async () => {
    const { phone } = await onePhone();
    await phone.sync.syncNow();
    expect(phone.sync.getStatus()).toBe(phone.sync.getStatus());
  });
});
