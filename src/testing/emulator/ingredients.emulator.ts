// The ingredient catalog against the emulators: the Firebase source passes the same
// contract as the in-memory one, reading data written by the real import command, under
// the real Security Rules.
import { createIngredientCatalogStore } from "@/repositories/IngredientCatalogStore";
import { createSqliteIngredientRepository } from "@/repositories/sqliteIngredientRepository";
import { createIngredientRefresh } from "@/services/ingredients/createIngredientRefresh";
import { createFirebaseRemoteIngredientSource } from "@/services/ingredients/firebaseRemoteIngredientSource";
import { SAMPLE_INGREDIENTS } from "@/services/ingredients/sampleIngredients";
import { runMigrations } from "@/storage/migrations";
import { join } from "node:path";
import { createFirebaseHarness } from "../contracts/firebaseHarness";
import { describeRemoteIngredientSourceContract } from "../contracts/remoteIngredientSourceContract";
import { createFakeConnectivity } from "../fakes/fakeConnectivity";
import { createNodeSqliteDatabase } from "../nodeSqliteDatabase";
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

// A client signed in as a new user (or nobody), reading through the app's own source.
async function source({ online = true, signedIn = true } = {}) {
  const connectivity = createFakeConnectivity(online).service;
  const backend = harness.createBackend({ connectivity });
  if (signedIn) {
    const result = await backend.auth.signUp({ email: harness.uniqueEmail(), password: "correct horse battery" });
    if (!result.ok) throw new Error(`Sign up failed: ${result.error}`);
  }
  return createFirebaseRemoteIngredientSource({ client: backend.client, connectivity });
}

describeRemoteIngredientSourceContract("Firebase emulators", {
  seeded: SAMPLE_INGREDIENTS,
  signedIn: ({ online = true } = {}) => source({ online }),
  signedOut: () => source({ signedIn: false }),
});

describe("the catalog end to end", () => {
  it("downloads from Firestore into SQLite, and the catalog matches recipe rows from it", async () => {
    const connectivity = createFakeConnectivity(true).service;
    const backend = harness.createBackend({ connectivity });
    const signUp = await backend.auth.signUp({ email: harness.uniqueEmail(), password: "correct horse battery" });
    if (!signUp.ok) throw new Error(`Sign up failed: ${signUp.error}`);

    const database = createNodeSqliteDatabase();
    await runMigrations(database);
    const repository = createSqliteIngredientRepository(database);
    const store = createIngredientCatalogStore(repository);
    const refresh = createIngredientRefresh({
      auth: backend.auth,
      connectivity,
      source: createFirebaseRemoteIngredientSource({ client: backend.client, connectivity }),
      repository,
    });

    const result = await refresh.refreshIfDue();
    expect(result.outcome).toBe("updated");
    // Other emulator test files write to the same collection: valid rows of their own, and
    // a document with only a name (firebaseBackend.emulator.ts), which is skipped and
    // counted like any invalid download.
    expect(result.valid).toBeGreaterThanOrEqual(SAMPLE_INGREDIENTS.length);

    await store.load();
    const catalog = store.getSnapshot();
    expect(catalog.find({ ingredientId: "test_flour", name: "test flour" })).toBeUndefined();
    expect(catalog.find({ name: "Large egg" })).toMatchObject({ id: "egg_whole_raw", gramsPerPiece: 50, allergensReviewed: true });
    expect(catalog.find({ name: "Peanut butter" })).toMatchObject({ allergens: ["peanuts"] });
    expect(catalog.find({ ingredientId: "all_purpose_flour", name: "x" })).toMatchObject({ gramsPerCup: 125 });
  });
});
