/// <reference types="node" />
// Imports Edwin's ingredient CSV into Firestore (ingredients/{id}).
// Run by a trusted person with an admin key (no Cloud Functions on the Spark plan).
//
// Check the file first (nothing is written, no key needed):
//   npm run import:ingredients -- path/to/ingredients.csv --dry-run
// Then import it:
//   npm run import:ingredients -- path/to/ingredients.csv --key path/to/serviceAccountKey.json
//
// Every row is checked with ingredientSchema. Rows with problems are skipped and
// listed, so Edwin can fix them and run the import again. Running it again
// replaces each ingredient with the latest version, so it never makes duplicates.
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import { ingredientSchema, ingredientWarnings, type Ingredient } from "../src/validation/ingredientSchema";

const NUMBER_COLUMNS = new Set([
  "grams_per_cup",
  "grams_per_piece",
  "package_price",
  "package_size",
  "calories_per_100g",
  "protein_g",
  "carbs_g",
  "fat_g",
  "saturated_fat_g",
  "fiber_g",
  "sugar_g",
  "sodium_mg",
]);
const LIST_COLUMNS = new Set(["aliases", "allergens", "diet_tags"]); // "a;b;c" -> ["a", "b", "c"]
const DATE_COLUMNS = new Set(["price_collected_at", "last_updated"]);
const YES_NO_COLUMNS = new Set(["allergens_reviewed"]); // yes -> true, no or blank -> false

// package_price -> packagePrice
function toCamelCase(column: string): string {
  return column.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

// "2026-10-13" is kept. "10/13/2026" (month/day/year) becomes "2026-10-13".
// Anything else is left as it is, so the schema rejects it and the row is listed.
function toDateKey(value: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) return value;
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function toYesNo(value: string): boolean | string {
  const lower = value.toLowerCase();
  if (lower === "yes" || lower === "true") return true;
  if (lower === "no" || lower === "false") return false;
  return value;
}

// Turns one CSV row (all text) into the shape ingredientSchema expects.
// Blank cells are left out.
function rowToInput(row: Record<string, string>): Record<string, unknown> {
  const input: Record<string, unknown> = { allergensReviewed: false };
  for (const [rawColumn, rawValue] of Object.entries(row)) {
    const column = rawColumn.trim();
    const value = rawValue.trim();
    if (value === "") continue;
    const key = toCamelCase(column);
    if (NUMBER_COLUMNS.has(column)) input[key] = Number(value);
    else if (LIST_COLUMNS.has(column)) input[key] = value.split(";").map((item) => item.trim()).filter(Boolean);
    else if (DATE_COLUMNS.has(column)) input[key] = toDateKey(value);
    else if (YES_NO_COLUMNS.has(column)) input[key] = toYesNo(value);
    else input[key] = value;
  }
  return input;
}

function readArgs(argv: string[]) {
  const keyIndex = argv.indexOf("--key");
  const keyPath = keyIndex >= 0 ? argv[keyIndex + 1] : undefined;
  const csvPath = argv.find((arg, index) => !arg.startsWith("--") && (keyIndex < 0 || index !== keyIndex + 1));
  return { csvPath, dryRun: argv.includes("--dry-run"), keyPath };
}

async function main() {
  const { csvPath, dryRun, keyPath } = readArgs(process.argv.slice(2));
  if (!csvPath || (!dryRun && !keyPath)) {
    console.error("Usage: npm run import:ingredients -- <file.csv> (--dry-run | --key <serviceAccountKey.json>)");
    process.exit(1);
  }

  // 1. Read and check every row.
  const rows: Record<string, string>[] = parse(readFileSync(csvPath, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });

  const ready: Ingredient[] = [];
  const problems: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();

  rows.forEach((row, index) => {
    const label = `Line ${index + 2} (${row.id || "no id"})`; // line 1 is the header
    const input = rowToInput(row);
    const result = ingredientSchema.safeParse(input);
    if (!result.success) {
      // One entry per bad field, showing the value that was rejected.
      const fields = new Map<string, string>();
      for (const issue of result.error.issues) {
        const field = String(issue.path[0] ?? "row");
        if (!fields.has(field)) fields.set(field, `${field} = ${JSON.stringify(input[field])} (${issue.message})`);
      }
      problems.push(`${label}: ${[...fields.values()].join(" | ")}`);
      return;
    }
    if (seenIds.has(result.data.id)) {
      problems.push(`${label}: id is used by an earlier row`);
      return;
    }
    seenIds.add(result.data.id);
    ready.push(result.data);
    for (const warning of ingredientWarnings(result.data)) warnings.push(`${label}: ${warning}`);
  });

  const unreviewed = ready.filter((ingredient) => !ingredient.allergensReviewed).length;
  console.log(`Checked ${rows.length} rows: ${ready.length} ready, ${problems.length} skipped.`);
  for (const problem of problems) console.log(`  SKIPPED ${problem}`);
  for (const warning of warnings) console.log(`  WARNING ${warning}`);
  if (unreviewed > 0) {
    console.log(`  NOTE ${unreviewed} ready rows have allergens_reviewed = no, so the app will show "allergens unknown" for them.`);
  }

  if (dryRun) {
    if (ready.length > 0) console.log("Example of what will be saved:", JSON.stringify(ready[0], null, 2));
    console.log("Dry run: nothing was written.");
    return;
  }

  // 2. Write the good rows. The admin key may write ingredients; the app may not
  //    (see firestore.rules). The id is the document name, so it is not saved again.
  const key = JSON.parse(readFileSync(keyPath!, "utf8"));
  const db = getFirestore(initializeApp({ credential: cert(key) }));
  for (let start = 0; start < ready.length; start += 400) {
    const batch = db.batch();
    for (const { id, ...data } of ready.slice(start, start + 400)) {
      batch.set(db.collection("ingredients").doc(id), data);
    }
    await batch.commit();
  }
  console.log(`Wrote ${ready.length} ingredients to Firestore.`);
}

main().catch((error: unknown) => {
  console.error("Import failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
