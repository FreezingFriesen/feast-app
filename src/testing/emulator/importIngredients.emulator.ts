/// <reference types="node" />
// The real import command, writing to the Firestore emulator through the same code path
// as a real import, with a small made-up file (not Edwin's). No key is involved.
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDocFromServer } from "firebase/firestore";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { EMULATOR_PROJECT_ID } from "../contracts/firebaseHarness";

const REPO_ROOT = resolve(__dirname, "../../..");
const FIXTURE = join(REPO_ROOT, "scripts/__fixtures__/ingredients-small.csv");

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: EMULATOR_PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(() => env.cleanup());

function runImport(extraEnv: Record<string, string> = {}) {
  // No credentials from the person's own machine can be picked up. emulators:exec has
  // already set FIRESTORE_EMULATOR_HOST.
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  if (!("GOOGLE_APPLICATION_CREDENTIALS" in extraEnv)) delete env.GOOGLE_APPLICATION_CREDENTIALS;
  return spawnSync(
    process.execPath,
    [join(REPO_ROOT, "node_modules/tsx/dist/cli.mjs"), "scripts/importIngredients.ts", FIXTURE, "--write"],
    { cwd: REPO_ROOT, env, encoding: "utf8" },
  );
}

async function readIngredient(id: string) {
  let snapshot!: Awaited<ReturnType<typeof getDocFromServer>>;
  await env.withSecurityRulesDisabled(async (context) => {
    snapshot = await getDocFromServer(doc(context.firestore(), `ingredients/${id}`));
  });
  return snapshot;
}

describe("importing ingredients", () => {
  it("writes the valid rows as not reviewed, and skips the invalid one", async () => {
    const { status, stdout } = runImport();
    expect(status).toBe(0);
    expect(stdout).toContain("Wrote 4 ingredients to the emulator.");

    for (const id of ["fixture_flour", "fixture_egg", "fixture_onion", "fixture_almond"]) {
      const snapshot = await readIngredient(id);
      expect(snapshot.exists()).toBe(true);
      expect(snapshot.data()).toMatchObject({ allergensReviewed: false });
    }
    expect((await readIngredient("fixture_candy")).exists()).toBe(false);
  });

  it("saves parsed values and the corrected spellings, and nothing extra", async () => {
    runImport();
    expect((await readIngredient("fixture_onion")).data()).toMatchObject({
      packageUnit: "lb",
      packagePrice: 3.49,
      priceCollectedAt: "2026-10-13", // written as 10/13/2026 in the file
    });
    const almond = (await readIngredient("fixture_almond")).data();
    expect(almond).toMatchObject({ allergens: ["tree_nuts"] });
    // The id is the document's name, and the Substitutes column isn't part of an ingredient.
    expect(almond).not.toHaveProperty("id");
    expect((await readIngredient("fixture_onion")).data()).not.toHaveProperty("Substitutes");
  });

  it("can be run twice safely", async () => {
    expect(runImport().status).toBe(0);
    const before = (await readIngredient("fixture_flour")).data();
    expect(runImport().status).toBe(0);
    expect((await readIngredient("fixture_flour")).data()).toEqual(before);
    expect((await readIngredient("fixture_candy")).exists()).toBe(false);
  });

  it("refuses a key inside the repo, even when the emulator is set", () => {
    const { status, stderr, stdout } = runImport({
      GOOGLE_APPLICATION_CREDENTIALS: join(REPO_ROOT, "serviceAccountKey.json"),
    });
    expect(status).toBe(1);
    expect(stderr).toContain("inside the repo");
    expect(stdout).not.toContain("Wrote");
  });
});
