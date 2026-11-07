/// <reference types="node" />
// Imports Edwin's ingredient CSV into Firestore (ingredients/{id}). Run by a trusted person
// (no Cloud Functions on the Spark plan).
//
// Check the file first. Nothing is written, and no credentials or network are needed:
//   npm run import:ingredients -- path/to/ingredients.csv --dry-run
//
// Then write it. Keep the key outside the repo: this refuses one inside it, and it never
// opens the key itself (the Firebase admin library reads the variable):
//   GOOGLE_APPLICATION_CREDENTIALS=/path/outside/repo/key.json
//   npm run import:ingredients -- path/to/ingredients.csv --write
//
// With FIRESTORE_EMULATOR_HOST set, the same code writes to the emulator instead.
//
// Rows with problems are skipped and listed, so Edwin can fix them and run the import
// again. Running it again replaces each ingredient with the latest version, so it never
// makes duplicates.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Ingredient } from "../src/validation/ingredientSchema";
import { checkIngredientCsv, formatImportReport, parseImportArgs, USAGE, writeProblem } from "./ingredientImportCore";

const BATCH_LIMIT = 400;
const REPO_ROOT = resolve(__dirname, "..");

// The admin key may write ingredients; the app may not (see firestore.rules). The id is
// the document name, so it is not saved again. set (not add) makes re-running safe.
async function writeIngredients(ingredients: Ingredient[]): Promise<void> {
  // Loaded only here, so a dry run needs no credentials and no network.
  const { applicationDefault, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");

  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-feast" })
    : initializeApp({ credential: applicationDefault() });
  const db = getFirestore(app);

  for (let start = 0; start < ingredients.length; start += BATCH_LIMIT) {
    const batch = db.batch();
    for (const { id, ...data } of ingredients.slice(start, start + BATCH_LIMIT)) {
      batch.set(db.collection("ingredients").doc(id), data);
    }
    await batch.commit();
  }
}

async function main() {
  const args = parseImportArgs(process.argv.slice(2));
  if (!args) {
    console.error(USAGE);
    process.exit(1);
  }

  // Refuse a bad setup before doing anything else.
  if (args.mode === "write") {
    const problem = writeProblem(process.env, REPO_ROOT);
    if (problem) {
      console.error(problem);
      process.exit(1);
    }
  }

  const check = checkIngredientCsv(readFileSync(args.csvPath, "utf8"));
  console.log(formatImportReport(check));

  if (args.mode === "dry-run") {
    if (check.ready.length > 0) console.log("Example of what will be saved:", JSON.stringify(check.ready[0], null, 2));
    console.log("Dry run: nothing was written.");
    return;
  }

  await writeIngredients(check.ready);
  const target = process.env.FIRESTORE_EMULATOR_HOST ? "the emulator" : "Firestore";
  console.log(`Wrote ${check.ready.length} ingredients to ${target}.`);
}

main().catch((error: unknown) => {
  console.error("Import failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
