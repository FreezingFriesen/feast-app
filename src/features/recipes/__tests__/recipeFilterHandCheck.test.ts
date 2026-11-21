// Phase 2's hand check (#10, N-04) in code, on the memory backend: the real composition
// root (createAppServices), SQLite, the in-memory sample ingredient data, a real sign up and
// saved restrictions. Each test is a row of the decision table, with the user allergic to
// milk. A person still needs to check the screen on a phone.
import { CATALOG_EMPTY_NOTICE, FILTER_OFF_MESSAGE, UNREVIEWED_NOTICE } from "@/features/recipes/filter/recipeListState";
import { createAppServices } from "@/services/createAppServices";
import { runMigrations } from "@/storage/migrations";
import { createFakeConnectivity } from "@/testing/fakes/fakeConnectivity";
import { createMemorySecureKeyValue } from "@/testing/fakes/memorySecureKeyValue";
import { createNodeSqliteDatabase } from "@/testing/nodeSqliteDatabase";
import { readyList, recipeListStateOn, saveHandCheckRecipes, shownRows } from "@/testing/recipeFilterTestBed";
import { DEFAULT_RECIPE_FILTER } from "@/validation/recipeFilterSchema";

async function startApp(database = createNodeSqliteDatabase(), online = true) {
  await runMigrations(database);
  const app = createAppServices({
    backend: "memory",
    database,
    secure: createMemorySecureKeyValue().store,
    connectivity: createFakeConnectivity(online).service,
  });
  const phone = {
    recipes: app.repositories.recipes,
    profiles: app.repositories.profiles,
    catalog: app.repositories.ingredientCatalog,
  };
  return { app, phone, database };
}

// Signs up with a username and saves a milk allergy (and any diets) on the phone.
async function signUp(app: Awaited<ReturnType<typeof startApp>>["app"], diets: ("vegan" | "vegetarian")[] = []) {
  const result = await app.services.auth.signUp({ email: "hand.check@example.com", password: "correct horse battery" });
  if (!result.ok) throw new Error(result.error);
  const uid = result.user.uid;
  const claim = await app.services.usernames.claim(uid, "hand_check");
  if (!claim.ok) throw new Error(claim.reason);
  await app.repositories.profiles.mergeIncoming(uid, claim.profile);
  const saved = await app.repositories.profiles.setDietaryRestrictions(uid, { allergens: ["milk"], diets });
  if (!saved.ok) throw new Error(saved.reason);
  return uid;
}

// Signed in with a milk allergy, the recipes saved, and the ingredient data downloaded
// ("Sync now") unless `download` is false.
async function phoneWithRecipes({ download = true, diets = [] as ("vegan" | "vegetarian")[] } = {}) {
  const started = await startApp();
  const uid = await signUp(started.app, diets);
  await saveHandCheckRecipes(started.app.repositories.recipes);
  if (download) {
    expect(await started.app.ingredientEngine.refreshIfDue({ force: true })).toMatchObject({ outcome: "updated" });
  }
  await started.app.repositories.ingredientCatalog.load();
  return { ...started, uid };
}

describe("the recipe filter on the memory backend (the Phase 2 hand check)", () => {
  it("filter on (the default): recipes listing milk are hidden and counted, the rest show with the right notes", async () => {
    const { phone, uid } = await phoneWithRecipes();
    const state = readyList(await recipeListStateOn(phone, uid));
    expect(shownRows(state)).toEqual([
      // Every row matched a reviewed ingredient, no milk: no note.
      "Omelette",
      "Peanut butter toast",
      // Every row matched, none reviewed, no milk listed: no row note, but the notice below.
      "Rice bowl",
      // A row that matches nothing.
      "Stir fry | Couldn't check: Hoisin sauce",
    ]);
    expect(state.hiddenMessage).toBe("2 recipes hidden by your allergies & diets");
    expect(state.dataNotice).toBe(UNREVIEWED_NOTICE);
    expect(state.profileRow).toEqual({ kind: "filter", on: true, text: "Using your allergies & diets: Milk" });
  });

  it("'Also hide recipes with ingredients Feast couldn't check' hides the stir fry too", async () => {
    const { phone, uid } = await phoneWithRecipes();
    const state = readyList(
      await recipeListStateOn(phone, uid, { filters: { ...DEFAULT_RECIPE_FILTER, hideUnchecked: true, sort: "title" } }),
    );
    expect(shownRows(state)).toEqual(["Omelette", "Peanut butter toast", "Rice bowl"]);
    expect(state).toMatchObject({ hiddenByProfile: 2, hiddenByFilters: 1 });
  });

  it("filter off ('Show them'): the milk recipes come back marked, and the screen says the filter is off", async () => {
    const { phone, uid } = await phoneWithRecipes();
    const state = readyList(await recipeListStateOn(phone, uid, { profileFilterOn: false }));
    expect(shownRows(state)).toEqual([
      "Latte | Contains: Milk",
      "Omelette",
      "Peanut butter toast",
      "Rice bowl",
      "Stir fry",
      "Vegan pancakes | Contains: Milk",
    ]);
    expect(state.offIndicator).toBe(FILTER_OFF_MESSAGE);
    expect(state.hiddenMessage).toBeNull();
    expect(state.dataNotice).toBeNull();
  });

  it("a vegan user: only vegan recipes count, the milk 'vegan' pancakes don't, and say why once the filter is off", async () => {
    const { phone, uid } = await phoneWithRecipes({ diets: ["vegan"] });
    const on = readyList(await recipeListStateOn(phone, uid));
    expect(on.rows).toEqual([]);
    expect(on.empty).toEqual({ kind: "no_matches", canClearFilters: false, canTurnOffProfile: true });

    const off = await recipeListStateOn(phone, uid, { profileFilterOn: false });
    expect(shownRows(off)).toContain("Vegan pancakes | Contains: Milk | Tagged Vegan, but contains Milk");
  });

  it("before the ingredient data downloads: every recipe shows, marked 'couldn't check', with the download notice", async () => {
    const { phone, uid } = await phoneWithRecipes({ download: false });
    expect(phone.catalog.getStatus()).toBe("empty");
    const state = readyList(await recipeListStateOn(phone, uid));
    expect(shownRows(state)).toEqual([
      "Latte | Couldn't check: Whole milk",
      "Omelette | Couldn't check: Large egg",
      "Peanut butter toast | Couldn't check: Peanut butter",
      "Rice bowl | Couldn't check: White rice, Canola oil",
      "Stir fry | Couldn't check: Soy sauce, Hoisin sauce",
      "Vegan pancakes | Couldn't check: Whole milk, White sugar",
    ]);
    expect(state.dataNotice).toBe(CATALOG_EMPTY_NOTICE);
    expect(state.hiddenMessage).toBeNull();
  });

  it("allergens the author marks count too: a recipe whose rows never match is still hidden for milk (#10)", async () => {
    const { app, phone, uid } = await phoneWithRecipes();
    const saved = await app.repositories.recipes.create({
      title: "Alfredo",
      servings: 2,
      ingredients: [{ name: "Mystery sauce", quantity: 1, unit: "cup" }],
      steps: ["Stir."],
      allergens: ["milk"],
    });
    if (!saved.ok) throw new Error("Couldn't save Alfredo");

    const on = readyList(await recipeListStateOn(phone, uid));
    expect(shownRows(on)).not.toContainEqual(expect.stringMatching(/^Alfredo/));
    expect(on.hiddenMessage).toBe("3 recipes hidden by your allergies & diets");

    const off = await recipeListStateOn(phone, uid, { profileFilterOn: false });
    expect(shownRows(off)).toContain("Alfredo | Contains: Milk");
  });

  it("after a restart offline (signed out on this backend): the phone's copy still hides milk recipes", async () => {
    const { database } = await phoneWithRecipes();
    // The memory backend forgets the signed-in user on a restart, so this uses a filter
    // chosen on screen. The Firebase emulator check covers the profile filter offline.
    const restarted = await startApp(database, false);
    await restarted.app.repositories.ingredientCatalog.load();
    expect(restarted.phone.catalog.getStatus()).toBe("ready");
    const state = readyList(
      await recipeListStateOn(restarted.phone, null, {
        filters: { ...DEFAULT_RECIPE_FILTER, excludeAllergens: ["milk"], sort: "title" },
      }),
    );
    expect(state.profileRow).toEqual({ kind: "signed_out" });
    expect(shownRows(state)).toEqual(["Omelette", "Peanut butter toast", "Rice bowl", "Stir fry | Couldn't check: Hoisin sauce"]);
    expect(state).toMatchObject({ hiddenByProfile: 0, hiddenByFilters: 2 });
  });
});
