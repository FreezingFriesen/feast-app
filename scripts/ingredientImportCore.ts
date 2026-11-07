/// <reference types="node" />
// Checks an ingredient CSV and reports what would be imported. Nothing here touches
// Firebase, so a dry run needs no credentials and no network. The writing is in
// importIngredients.ts.
import { parse } from "csv-parse/sync";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
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
const REVIEWED_COLUMN = "allergens_reviewed";

// The schema's fields. A CSV column is used only if it matches one of these.
const SCHEMA_FIELDS = new Set(Object.keys(ingredientSchema.shape));

// The only spellings corrected automatically, because Edwin's data is known to use them.
// Each one means exactly the value it's changed to. Anything else is left alone for the
// schema to judge: this is not a general clean-up, and ingredientSchema stays strict and
// still rejects all three of these if it's given them directly.
const KNOWN_SPELLINGS: Readonly<Record<string, ReadonlyMap<string, string>>> = {
  package_unit: new Map([["lbs", "lb"]]),
  allergens: new Map([
    ["tree nuts", "tree_nuts"],
    ["peanut", "peanuts"],
  ]),
};

// One correction, for the report.
export type SpellingFix = { field: string; from: string; to: string };

export type RowFix = SpellingFix & { line: number; id: string };
export type SkippedRow = { line: number; id: string; reasons: string[] };
export type RowWarning = { line: number; id: string; warning: string };

export type ImportCheck = {
  rowCount: number;
  ready: Ingredient[];
  skipped: SkippedRow[];
  warnings: RowWarning[];
  fixes: RowFix[];
  ignoredColumns: string[];
};

// package_price -> packagePrice
function toCamelCase(column: string): string {
  return column.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

const isUsedColumn = (column: string) => SCHEMA_FIELDS.has(toCamelCase(column));

// "2026-10-13" is kept. "10/13/2026" (month/day/year) becomes "2026-10-13".
// Anything else is left as it is, so the schema rejects it and the row is listed.
function toDateKey(value: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) return value;
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// TRUE or FALSE in any case. Anything else, including a blank cell, is left as text so
// the schema rejects the row: "not reviewed" has to be said, not assumed from a gap.
function toReviewed(value: string): boolean | string {
  const lower = value.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  return value;
}

const splitList = (value: string) => value.split(";").map((item) => item.trim()).filter(Boolean);

// Corrects the known spellings in one row of trimmed text. Runs before schema validation.
export function applyKnownSpellings(row: Record<string, string>): { row: Record<string, string>; fixes: SpellingFix[] } {
  const fixes: SpellingFix[] = [];
  const fix = (field: string, value: string) => {
    const corrected = KNOWN_SPELLINGS[field]?.get(value);
    if (corrected === undefined) return value;
    fixes.push({ field, from: value, to: corrected });
    return corrected;
  };

  const fixed = { ...row };
  for (const field of Object.keys(KNOWN_SPELLINGS)) {
    const value = row[field];
    if (value === undefined) continue;
    fixed[field] = LIST_COLUMNS.has(field) ? splitList(value).map((item) => fix(field, item)).join(";") : fix(field, value);
  }
  return { row: fixed, fixes };
}

// Turns one CSV row (all text) into the shape ingredientSchema expects. Blank cells are
// left out, and so are columns the schema doesn't have.
function rowToInput(row: Record<string, string>): Record<string, unknown> {
  // A CSV with no allergens_reviewed column means nobody has reviewed them.
  const input: Record<string, unknown> = { allergensReviewed: false };
  for (const [column, value] of Object.entries(row)) {
    if (!isUsedColumn(column)) continue;
    const key = toCamelCase(column);
    if (column === REVIEWED_COLUMN) {
      input[key] = toReviewed(value);
      continue;
    }
    if (value === "") continue;
    if (NUMBER_COLUMNS.has(column)) input[key] = Number(value);
    else if (LIST_COLUMNS.has(column)) input[key] = splitList(value);
    else if (DATE_COLUMNS.has(column)) input[key] = toDateKey(value);
    else input[key] = value;
  }
  return input;
}

type ParsedRecord = { record: Record<string, string>; info: { lines: number }; raw: string };

// The line a row starts on, which is where someone would look for it. The parser counts
// to where the row ends, so a cell spanning several lines is taken back off.
function startLine({ info, raw }: ParsedRecord): number {
  const linesInsideRow = raw.trim().split("\n").length - 1;
  return info.lines - linesInsideRow;
}

// Checks every row of a CSV. Rows with problems are skipped and listed.
export function checkIngredientCsv(csvText: string): ImportCheck {
  let header: string[] = [];
  // Line endings are made the same first, because the parser's line count is one too
  // high on Windows-style (CRLF) files, which is what Excel saves.
  const records: ParsedRecord[] = parse(csvText.replace(/\r\n?/g, "\n"), {
    columns: (columns: string[]) => {
      header = columns.map((column) => column.trim());
      return header;
    },
    skip_empty_lines: true,
    bom: true,
    info: true,
    raw: true,
  });

  const check: ImportCheck = {
    rowCount: records.length,
    ready: [],
    skipped: [],
    warnings: [],
    fixes: [],
    ignoredColumns: header.filter((column) => !isUsedColumn(column)),
  };
  const seenIds = new Set<string>();

  for (const parsed of records) {
    const trimmed = Object.fromEntries(Object.entries(parsed.record).map(([column, value]) => [column, value.trim()]));
    const line = startLine(parsed);
    const id = trimmed.id || "no id";

    const { row, fixes } = applyKnownSpellings(trimmed);
    check.fixes.push(...fixes.map((fix) => ({ ...fix, line, id })));

    const input = rowToInput(row);
    const result = ingredientSchema.safeParse(input);
    if (!result.success) {
      // One reason per bad field, showing the value that was rejected.
      const reasons = new Map<string, string>();
      for (const issue of result.error.issues) {
        const field = String(issue.path[0] ?? "row");
        if (!reasons.has(field)) reasons.set(field, `${field} = ${JSON.stringify(input[field])} (${issue.message})`);
      }
      check.skipped.push({ line, id, reasons: [...reasons.values()] });
      continue;
    }
    if (seenIds.has(result.data.id)) {
      check.skipped.push({ line, id, reasons: ["id is used by an earlier row"] });
      continue;
    }
    seenIds.add(result.data.id);
    check.ready.push(result.data);
    check.warnings.push(...ingredientWarnings(result.data).map((warning) => ({ line, id, warning })));
  }
  return check;
}

// The report a person reads: counts, every fix, every ignored column, every skipped row.
export function formatImportReport(check: ImportCheck): string {
  const lines = [
    `Checked ${check.rowCount} rows: ${check.ready.length} valid, ${check.skipped.length} skipped, ${check.warnings.length} warnings, ${check.fixes.length} spelling fixes.`,
    ...check.ignoredColumns.map((column) => `Ignoring column ${column}`),
    ...check.fixes.map(({ line, id, field, from, to }) => `  FIXED Line ${line} (${id}): ${field} "${from}" -> "${to}"`),
    ...check.skipped.map(({ line, id, reasons }) => `  SKIPPED Line ${line} (${id}): ${reasons.join(" | ")}`),
    ...check.warnings.map(({ line, id, warning }) => `  WARNING Line ${line} (${id}): ${warning}`),
  ];
  const unreviewed = check.ready.filter((ingredient) => !ingredient.allergensReviewed).length;
  if (unreviewed > 0) {
    lines.push(`  NOTE ${unreviewed} valid rows aren't marked allergens_reviewed = TRUE, so the app must show "allergens unknown" for them.`);
  }
  return lines.join("\n");
}

export type ImportArgs = { csvPath: string; mode: "dry-run" | "write" };

export const USAGE = "Usage: npm run import:ingredients -- <file.csv> (--dry-run | --write)";

// Exactly one CSV path and exactly one mode. Unknown options are refused.
export function parseImportArgs(argv: string[]): ImportArgs | null {
  const flags = argv.filter((arg) => arg.startsWith("--"));
  const paths = argv.filter((arg) => !arg.startsWith("--"));
  if (paths.length !== 1 || flags.length !== 1) return null;
  if (flags[0] !== "--dry-run" && flags[0] !== "--write") return null;
  return { csvPath: paths[0], mode: flags[0] === "--dry-run" ? "dry-run" : "write" };
}

// Follows links where it can. Only the path is looked at: the file is never opened.
function realPath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

function isInside(path: string, folder: string): boolean {
  const fromFolder = relative(folder, path);
  return fromFolder === "" || (fromFolder !== ".." && !fromFolder.startsWith(`..${sep}`) && !isAbsolute(fromFolder));
}

// Is this path inside the folder, either as written or after following links?
export function isInsideFolder(path: string, folder: string): boolean {
  return isInside(resolve(path), resolve(folder)) || isInside(realPath(path), realPath(folder));
}

// Why a real write can't start, or null if it can. A key inside the repo could be
// committed by accident, so it's refused. The key is never opened here: the Firebase
// admin library reads it from GOOGLE_APPLICATION_CREDENTIALS itself.
export function writeProblem(env: Record<string, string | undefined>, repoRoot: string): string | null {
  const credentials = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credentials && isInsideFolder(credentials, repoRoot)) {
    return "GOOGLE_APPLICATION_CREDENTIALS points inside the repo folder. Move the key outside the repo, then run this again.";
  }
  if (!credentials && !env.FIRESTORE_EMULATOR_HOST) {
    return "Nothing to write to. Set GOOGLE_APPLICATION_CREDENTIALS to a key outside the repo, or FIRESTORE_EMULATOR_HOST to use the emulator.";
  }
  return null;
}
