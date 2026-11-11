/// <reference types="node" />
// The sync engine with the real Firebase services and the real Security Rules (N-19, #19):
// what the in-memory tests can only promise, the emulators prove.
import type { CreateRecipeResult, Recipe } from "@/repositories/RecipeRepository";
import { createSqliteMealPlanRepository } from "@/repositories/sqliteMealPlanRepository";
import { createSqliteRecipeRepository } from "@/repositories/sqliteRecipeRepository";
import { createSyncService } from "@/services/sync/createSyncService";
import { createSqliteSyncMetaStore } from "@/services/sync/sqliteSyncMetaStore";
import { createFirebaseRemoteContentStore } from "@/services/userData/firebaseRemoteContentStore";
import { hasAllowedKeys } from "@/services/userData/remoteDocuments";
import { runMigrations } from "@/storage/migrations";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDocFromServer, setDoc, writeBatch } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { createFirebaseHarness, EMULATOR_PROJECT_ID } from "../contracts/firebaseHarness";
import { createFakeConnectivity } from "../fakes/fakeConnectivity";
import { createNodeSqliteDatabase } from "../nodeSqliteDatabase";
import { RECIPE_FORM_INPUT, recipeDocument } from "../syncFixtures";

const PASSWORD = "correct horse battery";
const DAY = 24 * 60 * 60 * 1000;
const harness = createFirebaseHarness();
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: EMULATOR_PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await harness.dispose();
  await env.cleanup();
});

// Reads a document directly, without the rules, to check what the server holds.
async function rawDoc(path: string) {
  let data: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (context) => {
    data = (await getDocFromServer(doc(context.firestore(), path))).data();
  });
  return data;
}

function expectCreated(result: CreateRecipeResult): Recipe {
  if (!result.ok) throw new Error("Expected the recipe to be created");
  return result.recipe;
}

// One phone: its own Firebase client, SQLite database, repositories and sync engine.
async function phone(email: string, mode: "sign_up" | "sign_in") {
  const backend = harness.createBackend();
  const result =
    mode === "sign_up"
      ? await backend.auth.signUp({ email, password: PASSWORD })
      : await backend.auth.signIn({ email, password: PASSWORD });
  if (!result.ok) throw new Error(`Couldn't sign in: ${result.error}`);

  let clockOffset = 0;
  const now = () => Date.now() + clockOffset;
  const db = createNodeSqliteDatabase();
  await runMigrations(db);
  const recipes = createSqliteRecipeRepository(db, now);
  const mealPlans = createSqliteMealPlanRepository(db, now);
  const connectivity = createFakeConnectivity(true).service;
  const sync = createSyncService({
    auth: backend.auth,
    remote: createFirebaseRemoteContentStore({ client: backend.client, connectivity }),
    recipes,
    mealPlans,
    meta: createSqliteSyncMetaStore(db),
    connectivity,
    now,
    schedule: () => () => {},
  });
  return {
    uid: result.user.uid,
    recipes,
    mealPlans,
    sync,
    setClockOffset: (ms: number) => {
      clockOffset = ms;
    },
  };
}

describe("sync on the Firebase emulators", () => {
  it("restores on a second phone, carries edits both ways, and agrees on a delete", async () => {
    const email = harness.uniqueEmail();
    const a = await phone(email, "sign_up");
    const first = expectCreated(await a.recipes.create({ ...RECIPE_FORM_INPUT, title: "First", description: "Flaky" }));
    const second = expectCreated(await a.recipes.create({ ...RECIPE_FORM_INPUT, title: "Second" }));
    const added = await a.mealPlans.add({ date: "2026-10-19", mealType: "dinner", recipeId: first.id, servings: 4 });
    if (!added.ok) throw new Error(added.reason);
    expect(await a.sync.syncNow()).toMatchObject({ state: "idle", pendingChanges: 0, problem: null });

    const b = await phone(email, "sign_in");
    const progress: unknown[] = [];
    b.sync.subscribe(() => progress.push(b.sync.getStatus().restore));
    expect(await b.sync.syncNow()).toMatchObject({ state: "idle", restore: null });
    expect(progress).toContainEqual({ completed: 3, total: 3 });
    expect(await b.recipes.list()).toEqual(await a.recipes.list());
    expect(await b.mealPlans.getById(added.entry.id)).toEqual(added.entry);

    await b.recipes.update(second.id, { ...RECIPE_FORM_INPUT, title: "Second, edited on B" });
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect((await a.recipes.getById(second.id))?.title).toBe("Second, edited on B");

    await a.recipes.remove(first.id);
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(await b.recipes.getById(first.id)).toBeUndefined();

    // What the server holds is exactly what the Rules allow: no id, no local fields.
    const tombstone = await rawDoc(`users/${a.uid}/recipes/${first.id}`);
    expect(tombstone).toHaveProperty("deletedAt");
    expect(tombstone).not.toHaveProperty("id");
    expect(hasAllowedKeys("recipes", tombstone!)).toBe(true);
    expect(hasAllowedKeys("mealPlanEntries", (await rawDoc(`users/${a.uid}/mealPlanEntries/${added.entry.id}`))!)).toBe(
      true,
    );
  });

  it("restores 1,200 records page by page, and skips an invalid one", async () => {
    const owner = await phone(harness.uniqueEmail(), "sign_up");
    const base = Date.now() - 60_000;
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (let start = 0; start < 1_200; start += 400) {
        const batch = writeBatch(db);
        for (let i = start; i < start + 400; i += 1) {
          batch.set(doc(db, `users/${owner.uid}/recipes/r-${i}`), recipeDocument(base + (i % 7)));
        }
        await batch.commit();
      }
      await setDoc(doc(db, `users/${owner.uid}/recipes/bad-one`), { ...recipeDocument(base), title: 5 });
    });

    expect(await owner.sync.syncNow()).toMatchObject({ state: "idle", restore: null });
    expect(await owner.recipes.list()).toHaveLength(1_200);
    expect(owner.sync.lastReport()).toMatchObject({ downloaded: 1_201, skipped: 1 });
  });

  it("the real Rules refuse a record from a clock a day fast; the others still upload", async () => {
    const user = await phone(harness.uniqueEmail(), "sign_up");
    const fine = expectCreated(await user.recipes.create({ ...RECIPE_FORM_INPUT, title: "Fine" }));
    user.setClockOffset(DAY);
    const future = expectCreated(await user.recipes.create({ ...RECIPE_FORM_INPUT, title: "Future" }));
    user.setClockOffset(0);

    expect(await user.sync.syncNow()).toMatchObject({
      state: "error",
      problem: { kind: "rejected", count: 1 },
      pendingChanges: 1,
    });
    expect(await rawDoc(`users/${user.uid}/recipes/${fine.id}`)).toMatchObject({ title: "Fine" });
    expect(await rawDoc(`users/${user.uid}/recipes/${future.id}`)).toBeUndefined();
  });
});
