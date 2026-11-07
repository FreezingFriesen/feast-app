/// <reference types="node" />
import { ingredientSchema } from "@/validation/ingredientSchema";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import {
  applyKnownSpellings,
  checkIngredientCsv,
  formatImportReport,
  isInsideFolder,
  parseImportArgs,
  writeProblem,
} from "../ingredientImportCore";

const REPO_ROOT = resolve(__dirname, "../..");
const FIXTURE = join(REPO_ROOT, "scripts/__fixtures__/ingredients-small.csv");

const HEADER =
  "id,name,category,package_price,package_size,package_unit,price_source,price_collected_at,currency,region,calories_per_100g,protein_g,carbs_g,fat_g,saturated_fat_g,fiber_g,sugar_g,sodium_mg,nutrition_source,allergens,last_updated";

// One valid row, with chosen cells changed.
const row = (cells: { id?: string; unit?: string; allergens?: string; extra?: string } = {}) =>
  [
    cells.id ?? "test_item",
    "Test item",
    "pantry",
    "1.99",
    "100",
    cells.unit ?? "g",
    "Test Store",
    "2026-10-13",
    "CAD",
    "Alberta",
    "100",
    "1",
    "1",
    "1",
    "0",
    "0",
    "0",
    "0",
    "Test Data",
    cells.allergens ?? "",
    "2026-10-13",
    ...(cells.extra === undefined ? [] : [cells.extra]),
  ].join(",");

const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");

// The fields ingredientSchema needs, for checking it directly.
const validIngredient = () => {
  const { id, ...rest } = checkIngredientCsv(csv(row())).ready[0];
  return { id, ...rest };
};

describe("the three known spellings", () => {
  it.each([
    ["package_unit", "lbs", "lb"],
    ["allergens", "tree nuts", "tree_nuts"],
    ["allergens", "peanut", "peanuts"],
  ])("corrects %s %p to %p", (field, from, to) => {
    expect(applyKnownSpellings({ [field]: from })).toEqual({
      row: { [field]: to },
      fixes: [{ field, from, to }],
    });
  });

  it("corrects them inside an allergen list", () => {
    const { row: fixed, fixes } = applyKnownSpellings({ allergens: "milk; tree nuts;peanut" });
    expect(fixed.allergens).toBe("milk;tree_nuts;peanuts");
    expect(fixes).toHaveLength(2);
  });

  it.each([
    ["package_unit", "LBS"],
    ["package_unit", "lb"],
    ["package_unit", "pounds"],
    ["allergens", "Tree Nuts"],
    ["allergens", "tree_nuts"],
    ["allergens", "peanuts"],
    ["allergens", "Peanut"],
    ["aliases", "peanut"], // the right spelling only in the right column
    ["name", "lbs"],
  ])("leaves %s %p alone", (field, value) => {
    expect(applyKnownSpellings({ [field]: value })).toEqual({ row: { [field]: value }, fixes: [] });
  });

  it.each([
    ["packageUnit", "lbs"],
    ["allergens", ["tree nuts"]],
    ["allergens", ["peanut"]],
  ])("ingredientSchema itself still rejects %s = %j", (field, value) => {
    expect(ingredientSchema.safeParse(validIngredient()).success).toBe(true);
    expect(ingredientSchema.safeParse({ ...validIngredient(), [field]: value }).success).toBe(false);
  });

  it("makes the row valid, and records the line, id, field and change", () => {
    const check = checkIngredientCsv(csv(row(), row({ id: "pounds_item", unit: "lbs" })));
    expect(check.skipped).toEqual([]);
    expect(check.ready[1]).toMatchObject({ id: "pounds_item", packageUnit: "lb" });
    expect(check.fixes).toEqual([{ line: 3, id: "pounds_item", field: "package_unit", from: "lbs", to: "lb" }]);
    expect(formatImportReport(check)).toContain('FIXED Line 3 (pounds_item): package_unit "lbs" -> "lb"');
  });
});

describe("columns the importer doesn't use", () => {
  const withExtra = [`${HEADER},Substitutes,Notes2`, `${row()},bread flour,x`].join("\n");

  it("names each one, once", () => {
    const check = checkIngredientCsv(withExtra);
    expect(check.ignoredColumns).toEqual(["Substitutes", "Notes2"]);
    expect(formatImportReport(check)).toContain("Ignoring column Substitutes");
  });

  it("doesn't save them", () => {
    expect(checkIngredientCsv(withExtra).ready[0]).not.toHaveProperty("Substitutes");
    expect(checkIngredientCsv(withExtra).ready[0]).not.toHaveProperty("substitutes");
  });

  it("names nothing when every column is used", () => {
    expect(checkIngredientCsv(csv(row())).ignoredColumns).toEqual([]);
  });
});

describe("allergens_reviewed", () => {
  const withReviewed = (value: string) => [`${HEADER},allergens_reviewed`, row({ extra: value })].join("\n");

  it("is false when the column is missing", () => {
    expect(checkIngredientCsv(csv(row())).ready[0].allergensReviewed).toBe(false);
  });

  it.each([
    ["TRUE", true],
    ["true", true],
    ["True", true],
    ["FALSE", false],
    ["false", false],
    ["False", false],
    [" TRUE ", true],
  ])("accepts %p as %p", (value, expected) => {
    const check = checkIngredientCsv(withReviewed(value));
    expect(check.skipped).toEqual([]);
    expect(check.ready[0].allergensReviewed).toBe(expected);
  });

  it.each(["yes", "no", "1", "0", "maybe", "", "TRUEE", "<script>alert(1)</script>"])("makes %p a row error", (value) => {
    const check = checkIngredientCsv(withReviewed(value));
    expect(check.ready).toEqual([]);
    expect(check.skipped).toHaveLength(1);
    expect(check.skipped[0].reasons[0]).toContain("allergensReviewed");
  });
});

describe("the report", () => {
  it("gives the counts, and each skipped row's line, id and reasons", () => {
    const report = formatImportReport(checkIngredientCsv(csv(row(), row({ id: "bad id!" }), row({ allergens: "gluten", id: "bad_allergen" }))));
    expect(report).toContain("Checked 3 rows: 1 valid, 2 skipped, 0 warnings, 0 spelling fixes.");
    expect(report).toContain('SKIPPED Line 3 (bad id!): id = "bad id!"');
    expect(report).toContain('SKIPPED Line 4 (bad_allergen): allergens = ["gluten"]');
  });

  it("says when rows haven't had their allergens reviewed", () => {
    expect(formatImportReport(checkIngredientCsv(csv(row())))).toContain("allergens unknown");
  });

  it("lists duplicate ids and warnings", () => {
    const check = checkIngredientCsv(csv(row(), row()));
    expect(check.skipped).toEqual([{ line: 3, id: "test_item", reasons: ["id is used by an earlier row"] }]);
  });

  describe("line numbers", () => {
    const bad = (id: string) => row({ id: `${id}!` });
    const linesOf = (text: string) => checkIngredientCsv(text).skipped.map(({ line }) => line);

    it("count from the header as line 1", () => {
      expect(linesOf([HEADER, bad("a"), row(), bad("b")].join("\n"))).toEqual([2, 4]);
    });

    it("are the same with Windows line endings, which Excel saves", () => {
      expect(linesOf([HEADER, bad("a"), row(), bad("b")].join("\r\n"))).toEqual([2, 4]);
      expect(linesOf([HEADER, bad("a"), row(), bad("b"), ""].join("\r\n"))).toEqual([2, 4]);
    });

    it("count blank lines", () => {
      expect(linesOf([HEADER, "", bad("a"), "", "", bad("b"), ""].join("\n"))).toEqual([3, 6]);
    });

    it("work without a final newline, and with one", () => {
      expect(linesOf([HEADER, row(), bad("a")].join("\n"))).toEqual([3]);
      expect(linesOf([HEADER, row(), bad("a"), ""].join("\n"))).toEqual([3]);
    });

    it.each(["\n", "\r\n"])("point at where a row starts when a cell spans lines (%j)", (newline) => {
      const multiLine = bad("a").replace("Test Store", `"Test${newline}Store"`);
      expect(linesOf([HEADER, multiLine, bad("b")].join(newline))).toEqual([2, 4]);
    });
  });

  it("gives empty results for a CSV with only a header", () => {
    expect(checkIngredientCsv(HEADER)).toMatchObject({ rowCount: 0, ready: [], skipped: [] });
  });
});

describe("the small fixture", () => {
  const check = checkIngredientCsv(readFileSync(FIXTURE, "utf8"));

  it("has 4 valid rows, 1 invalid row and 2 spelling fixes", () => {
    expect(check.ready.map((ingredient) => ingredient.id)).toEqual([
      "fixture_flour",
      "fixture_egg",
      "fixture_onion",
      "fixture_almond",
    ]);
    expect(check.skipped.map((skipped) => skipped.id)).toEqual(["fixture_candy"]);
    expect(check.fixes.map((fix) => fix.to)).toEqual(["lb", "tree_nuts"]);
    expect(check.ignoredColumns).toEqual(["Substitutes"]);
  });

  it("marks every valid row as not reviewed", () => {
    expect(check.ready.every((ingredient) => ingredient.allergensReviewed === false)).toBe(true);
  });
});

describe("parseImportArgs", () => {
  it.each([
    [["a.csv", "--dry-run"], { csvPath: "a.csv", mode: "dry-run" }],
    [["--write", "a.csv"], { csvPath: "a.csv", mode: "write" }],
  ])("%j -> %j", (argv, expected) => {
    expect(parseImportArgs(argv)).toEqual(expected);
  });

  it.each([
    [[]],
    [["a.csv"]],
    [["--dry-run"]],
    [["a.csv", "b.csv", "--dry-run"]],
    [["a.csv", "--dry-run", "--write"]],
    [["a.csv", "--key", "key.json"]], // the old option: a key is never read by this script
    [["a.csv", "--force"]],
  ])("refuses %j", (argv) => {
    expect(parseImportArgs(argv)).toBeNull();
  });
});

describe("isInsideFolder", () => {
  const folder = resolve(REPO_ROOT);

  it.each([
    [join(folder, "key.json"), true],
    [join(folder, "scripts", "key.json"), true],
    [folder, true],
    [join(folder, "..", "key.json"), false],
    [`${folder}-keys${sep}key.json`, false], // a neighbouring folder with a similar name
    [join(folder, "..foo", "key.json"), true], // inside, despite the leading dots
  ])("%s -> %p", (path, expected) => {
    expect(isInsideFolder(path, folder)).toBe(expected);
  });

  it("treats a relative path as relative to where the script runs", () => {
    expect(isInsideFolder(join("..", "definitely-outside", "..", "..", "key.json"), folder)).toBe(false);
  });
});

describe("writeProblem", () => {
  const outside = resolve(REPO_ROOT, "..", "keys", "key.json");
  const inside = join(REPO_ROOT, "serviceAccountKey.json");

  it("refuses a key inside the repo, even with the emulator set", () => {
    expect(writeProblem({ GOOGLE_APPLICATION_CREDENTIALS: inside }, REPO_ROOT)).toContain("inside the repo");
    expect(
      writeProblem({ GOOGLE_APPLICATION_CREDENTIALS: inside, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }, REPO_ROOT),
    ).toContain("inside the repo");
  });

  it("refuses when there's nowhere to write", () => {
    expect(writeProblem({}, REPO_ROOT)).toContain("Nothing to write to");
  });

  it("allows a key outside the repo, or the emulator", () => {
    expect(writeProblem({ GOOGLE_APPLICATION_CREDENTIALS: outside }, REPO_ROOT)).toBeNull();
    expect(writeProblem({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }, REPO_ROOT)).toBeNull();
  });

  it("doesn't put the key's path in the message", () => {
    expect(writeProblem({ GOOGLE_APPLICATION_CREDENTIALS: inside }, REPO_ROOT)).not.toContain("serviceAccountKey");
  });
});

describe("the command line", () => {
  // No credentials and no emulator in the environment, so nothing could reach Firebase.
  const cleanEnv: NodeJS.ProcessEnv = { ...process.env };
  delete cleanEnv.GOOGLE_APPLICATION_CREDENTIALS;
  delete cleanEnv.FIRESTORE_EMULATOR_HOST;
  const run = (args: string[], env: NodeJS.ProcessEnv = cleanEnv) =>
    spawnSync(process.execPath, [join(REPO_ROOT, "node_modules/tsx/dist/cli.mjs"), "scripts/importIngredients.ts", ...args], {
      cwd: REPO_ROOT,
      env,
      encoding: "utf8",
    });

  it("runs a dry run with no credentials and no network", () => {
    const { status, stdout } = run([FIXTURE, "--dry-run"]);
    expect(status).toBe(0);
    expect(stdout).toContain("Checked 5 rows: 4 valid, 1 skipped");
    expect(stdout).toContain("Ignoring column Substitutes");
    expect(stdout).toContain('FIXED Line 4 (fixture_onion): package_unit "lbs" -> "lb"');
    expect(stdout).toContain("SKIPPED Line 6 (fixture_candy)");
    expect(stdout).toContain("Dry run: nothing was written.");
  });

  it("refuses to write with a key inside the repo, before reading anything", () => {
    const { status, stderr, stdout } = run([FIXTURE, "--write"], {
      ...cleanEnv,
      GOOGLE_APPLICATION_CREDENTIALS: join(REPO_ROOT, "serviceAccountKey.json"),
    });
    expect(status).toBe(1);
    expect(stderr).toContain("inside the repo");
    expect(stdout).not.toContain("Checked");
  });

  it("refuses to write with nowhere to write to", () => {
    const { status, stderr } = run([FIXTURE, "--write"]);
    expect(status).toBe(1);
    expect(stderr).toContain("Nothing to write to");
  });

  it("shows how to use it for the old --key option", () => {
    const { status, stderr } = run([FIXTURE, "--key", "key.json"]);
    expect(status).toBe(1);
    expect(stderr).toContain("Usage");
  });
});
