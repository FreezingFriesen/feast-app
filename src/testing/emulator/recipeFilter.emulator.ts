// The recipe filter (#10, N-04) on the Firebase backend: a real sign up and username claim,
// the ingredient data downloaded from Firestore under the real Security Rules (written by
// the real import command), then airplane mode and a restart. Phase 2's Firebase hand check
// in code; a person still needs to check the screen on a phone.
import { createIngredientCatalogStore } from "@/repositories/IngredientCatalogStore";
import { createSqliteIngredientRepository } from "@/repositories/sqliteIngredientRepository";
import { createSqliteProfileRepository } from "@/repositories/sqliteProfileRepository";
import { createSqliteRecipeRepository } from "@/repositories/sqliteRecipeRepository";
import { createIngredientRefresh } from "@/services/ingredients/createIngredientRefresh";
import { createFirebaseRemoteIngredientSource } from "@/services/ingredients/firebaseRemoteIngredientSource";
import { SAMPLE_INGREDIENTS } from "@/services/ingredients/sampleIngredients";
import type { SqlDatabase } from "@/storage/SqlDatabase";
import { runMigrations } from "@/storage/migrations";
import { join } from "node:path";
import { createFirebaseHarness } from "../contracts/firebaseHarness";
import { createFakeConnectivity } from "../fakes/fakeConnectivity";
import { createNodeSqliteDatabase } from "../nodeSqliteDatabase";
import { readyList, recipeListStateOn, saveHandCheckRecipes, shownRows } from "../recipeFilterTestBed";
import { REPO_ROOT, runIngredientImport } from "./runIngredientImport";

// The same rows as SAMPLE_INGREDIENTS (a test in scripts/__tests__ keeps them identical).
const CATALOG_FIXTURE = join(REPO_ROOT, "scripts/__fixtures__/ingredients-catalog.csv");

const harness = createFirebaseHarness();

beforeAll(() => {
  const { status, stdout, stderr } = runIngredientImport(CATALOG_FIXTURE);
  if (status !== 0 || !stdout.includes(`Wrote ${SAMPLE_INGREDIENTS.length} ingredients to the emulator.`)) {
    throw new Error(`Seeding the emulator failed: ${stderr}`);
  }
});

afterAll(() => harness.dispose());

// One phone's own side, built over its SQLite database. A restart builds it again.
function phoneOn(database: SqlDatabase) {
  const ingredients = createSqliteIngredientRepository(database);
  return {
    recipes: createSqliteRecipeRepository(database),
    profiles: createSqliteProfileRepository(database),
    ingredients,
    catalog: createIngredientCatalogStore(ingredients),
  };
}

describe("the recipe filter on the Firebase backend", () => {
  it("filters by the user's milk allergy against the downloaded data, and still does after airplane mode and a restart", async () => {
    const connectivity = createFakeConnectivity(true);
    const backend = harness.createBackend({ connectivity: connectivity.service });
    const signUp = await backend.auth.signUp({ email: harness.uniqueEmail(), password: "correct horse battery" });
    if (!signUp.ok) throw new Error(`Sign up failed: ${signUp.error}`);
    const uid = signUp.user.uid;
    const claim = await backend.usernames.claim(uid, harness.uniqueUsername());
    if (!claim.ok) throw new Error(`Claim failed: ${claim.reason}`);

    const database = createNodeSqliteDatabase();
    await runMigrations(database);
    const phone = phoneOn(database);
    expect(await phone.profiles.mergeIncoming(uid, claim.profile)).toBe("applied");
    const saved = await phone.profiles.setDietaryRestrictions(uid, { allergens: ["milk"], diets: [] });
    if (!saved.ok) throw new Error(`Saving the restrictions failed: ${saved.reason}`);
    await saveHandCheckRecipes(phone.recipes);

    // "Sync now": download the ingredient data from Firestore.
    const refresh = createIngredientRefresh({
      auth: backend.auth,
      connectivity: connectivity.service,
      source: createFirebaseRemoteIngredientSource({ client: backend.client, connectivity: connectivity.service }),
      repository: phone.ingredients,
    });
    expect(await refresh.refreshIfDue({ force: true })).toMatchObject({ outcome: "updated" });
    await phone.catalog.load();
    expect(phone.catalog.getStatus()).toBe("ready");

    const expected = ["Omelette", "Peanut butter toast", "Rice bowl", "Stir fry | Couldn't check: Hoisin sauce"];
    const online = readyList(await recipeListStateOn(phone, uid));
    expect(shownRows(online)).toEqual(expected);
    expect(online.hiddenMessage).toBe("2 recipes hidden by your allergies & diets");

    // Airplane mode, then a restart: everything on the phone is built again over the same
    // database. The profile and the ingredient data come from SQLite, with no network.
    connectivity.setOnline(false);
    const restarted = phoneOn(database);
    expect(restarted.catalog.getStatus()).toBe("loading");
    await restarted.catalog.load();
    expect(restarted.catalog.getStatus()).toBe("ready");

    const offline = readyList(await recipeListStateOn(restarted, uid));
    expect(shownRows(offline)).toEqual(expected);
    expect(offline.hiddenMessage).toBe("2 recipes hidden by your allergies & diets");
    expect(shownRows(await recipeListStateOn(restarted, uid, { profileFilterOn: false }))).toEqual([
      "Latte | Contains: Milk",
      "Omelette",
      "Peanut butter toast",
      "Rice bowl",
      "Stir fry",
      "Vegan pancakes | Contains: Milk",
    ]);
  });
});
