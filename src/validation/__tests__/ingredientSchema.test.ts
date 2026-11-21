import { catalogMatchSchema, ingredientSchema, ingredientWarnings, storedIngredientSchema } from "../ingredientSchema";

// The egg row from Edwin's dataset, with its allergen corrected to the shared list.
const valid = {
  id: "egg_whole_raw",
  name: "Egg, whole, raw",
  aliases: ["eggs", "large egg"],
  category: "dairy_eggs",
  gramsPerPiece: 50,
  pieceDescription: "1 large egg, shelled",
  packagePrice: 4.23,
  packageSize: 12,
  packageUnit: "each",
  priceSource: "Superstore",
  priceCollectedAt: "2026-10-13",
  currency: "CAD",
  region: "Alberta",
  caloriesPer100g: 142.9,
  proteinG: 12.5,
  carbsG: 1.7,
  fatG: 10.7,
  saturatedFatG: 2.7,
  fiberG: 0,
  sugarG: 0,
  sodiumMg: 125,
  nutritionSource: "NO NAME Eggs, Large",
  allergens: ["eggs"],
  allergensReviewed: true,
  dietTags: ["vegetarian", "keto_friendly", "gluten_free", "dairy_free"],
  lastUpdated: "2026-10-13",
};

const accepts = (input: unknown) => ingredientSchema.safeParse(input).success;
const without = (field: keyof typeof valid) => {
  const copy: Record<string, unknown> = { ...valid };
  delete copy[field];
  return copy;
};

const ATTACK_STRINGS = [
  "'; DROP TABLE recipes;--",
  "<script>alert(1)</script>",
  "a".repeat(10_000),
  "",
  "🍕",
];

describe("ingredientSchema", () => {
  it("accepts a valid ingredient and returns it unchanged", () => {
    const result = ingredientSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(valid);
  });

  it("drops columns that are not in the schema", () => {
    expect(ingredientSchema.safeParse({ ...valid, isAdmin: true }).data).toEqual(valid);
  });

  it("fills blank lists with empty lists", () => {
    const result = ingredientSchema.safeParse({ ...without("aliases"), allergens: undefined, dietTags: undefined });
    expect(result.data?.aliases).toEqual([]);
    expect(result.data?.allergens).toEqual([]);
    expect(result.data?.dietTags).toEqual([]);
  });

  it.each([
    "name",
    "category",
    "packagePrice",
    "packageSize",
    "packageUnit",
    "priceSource",
    "priceCollectedAt",
    "currency",
    "region",
    "caloriesPer100g",
    "proteinG",
    "sodiumMg",
    "nutritionSource",
    "allergensReviewed",
    "lastUpdated",
  ] as const)("requires %p", (field) => {
    expect(accepts(without(field))).toBe(false);
  });

  it("lets conversion data be blank", () => {
    expect(accepts({ ...without("gramsPerPiece"), pieceDescription: undefined })).toBe(true);
  });

  it("needs pieceDescription when gramsPerPiece is set", () => {
    expect(accepts(without("pieceDescription"))).toBe(false);
  });

  it.each([...ATTACK_STRINGS, "Chick_peas", "with space", "a/b", "../x"])("rejects id %p", (id) => {
    expect(accepts({ ...valid, id })).toBe(false);
  });

  it.each(ATTACK_STRINGS)("rejects attack name %#", (name) => {
    expect(accepts({ ...valid, name })).toBe(false);
  });

  it("keeps attack text in notes as plain text", () => {
    const notes = "<script>alert(1)</script>";
    expect(ingredientSchema.safeParse({ ...valid, notes }).data?.notes).toBe(notes);
  });

  it.each([
    ["allergens", ["egg"]],
    ["allergens", ["gluten"]],
    ["allergens", ["eggs", "eggs"]],
    ["dietTags", ["paleo"]],
    ["packageUnit", "mg"],
    ["packageUnit", "oz"],
    // The importer corrects these three before checking; the schema itself stays strict.
    ["packageUnit", "lbs"],
    ["allergens", ["tree nuts"]],
    ["allergens", ["peanut"]],
    ["category", "candy"],
    ["currency", "USD"],
    ["region", "Ontario"],
  ])("rejects %p = %p", (field, value) => {
    expect(accepts({ ...valid, [field]: value })).toBe(false);
  });

  it.each(["13-Oct", "10/13/2026", "2026-02-30", "10/18+Y76+Z60", "2019-12-31", "2999-01-01"])(
    "rejects price date %p",
    (date) => {
      expect(accepts({ ...valid, priceCollectedAt: date })).toBe(false);
    },
  );

  it.each([
    ["packagePrice", 0, false],
    ["packagePrice", 0.01, true],
    ["packagePrice", 3.799, false], // more than 2 decimals
    ["packagePrice", 10_000, true],
    ["packagePrice", 10_001, false],
    ["packageSize", 0, false],
    ["caloriesPer100g", 900, true],
    ["caloriesPer100g", 1000, false], // the oils in the example file
    ["fatG", 112.5, false],
    ["sodiumMg", 40_000, true],
    ["sodiumMg", 40_001, false],
    ["gramsPerPiece", 5001, false],
    ["proteinG", NaN, false],
    ["proteinG", -1, false],
    ["sodiumMg", Infinity, false],
    ["packageSize", "12", false],
  ])("%p = %p -> %p", (field, value, ok) => {
    expect(accepts({ ...valid, [field]: value })).toBe(ok);
  });

  it("rejects protein + carbs + fat over 100 g", () => {
    expect(accepts({ ...valid, proteinG: 40, carbsG: 40, fatG: 30, saturatedFatG: 1 })).toBe(false);
  });

  it("rejects more saturated fat than fat", () => {
    expect(accepts({ ...valid, saturatedFatG: 11 })).toBe(false);
  });

  it("limits aliases to 10 of up to 50 characters", () => {
    expect(accepts({ ...valid, aliases: Array(11).fill("egg") })).toBe(false);
    expect(accepts({ ...valid, aliases: ["a".repeat(51)] })).toBe(false);
  });
});

describe("ingredientWarnings", () => {
  const parsed = (patch: object) => ingredientSchema.parse({ ...valid, ...patch });

  it("allows small rounding gaps between sugar + fibre and carbs", () => {
    expect(ingredientWarnings(parsed({ carbsG: 3.5, sugarG: 2.4, fiberG: 2.4 }))).toEqual([]);
  });

  it("warns when sugar + fibre is well above carbs", () => {
    expect(ingredientWarnings(parsed({ carbsG: 2, sugarG: 2, fiberG: 2 }))).toHaveLength(1);
  });
});

describe("storedIngredientSchema (an ingredient downloaded or read back from the phone)", () => {
  const stored = (input: unknown) => storedIngredientSchema.safeParse(input);
  // The day after today, by the phone's clock.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  it("accepts what the import saves, and returns it unchanged", () => {
    const imported = ingredientSchema.parse(valid);
    expect(stored(imported).data).toEqual(imported);
  });

  it("accepts a price collected 'tomorrow', which a phone whose clock is behind would see", () => {
    expect(accepts({ ...valid, priceCollectedAt: tomorrow })).toBe(false);
    expect(stored({ ...valid, priceCollectedAt: tomorrow }).success).toBe(true);
  });

  it("keeps every other price date rule", () => {
    for (const date of ["2019-12-31", "2026-02-30", "10/13/2026"]) {
      expect(stored({ ...valid, priceCollectedAt: date }).success).toBe(false);
    }
  });

  it.each([
    ["allergens", ["gluten"]],
    ["allergens", ["eggs", "eggs"]],
    ["dietTags", ["vegan", "vegan"]],
    ["packagePrice", -1],
    ["id", "../x"],
    ["id", "roll_dinner_+A148+A140"],
    ["name", "a".repeat(10_000)],
    ["name", "<script>alert(1)</script>"],
    ["name", "'; DROP TABLE ingredients;--"],
    ["proteinG", 40], // with carbs and fat, over 100 g
  ])("rejects %p = %p", (field, value) => {
    const input = field === "proteinG" ? { ...valid, proteinG: 40, carbsG: 40, fatG: 30, saturatedFatG: 1 } : { ...valid, [field]: value };
    expect(stored(input).success).toBe(false);
  });

  it("keeps attack text in free-text fields as plain text", () => {
    const notes = "'; DROP TABLE ingredients;-- <script>alert(1)</script>";
    expect(stored({ ...valid, notes }).data?.notes).toBe(notes);
  });

  it("strips keys the schema doesn't have", () => {
    expect(stored({ ...valid, isAdmin: true, pricePerUnit: 1 }).data).toEqual(valid);
  });
});

describe("catalogMatchSchema (what a catalog hands the app)", () => {
  it("accepts an ID with or without conversion data, and drops unknown keys", () => {
    expect(catalogMatchSchema.parse({ id: "all_purpose_flour", gramsPerCup: 125 })).toEqual({
      id: "all_purpose_flour",
      gramsPerCup: 125,
    });
    expect(catalogMatchSchema.parse({ id: "egg_whole_raw", gramsPerPiece: 50, packagePrice: 4.23 })).toEqual({
      id: "egg_whole_raw",
      gramsPerPiece: 50,
    });
  });

  it("keeps the name and the safety tags", () => {
    const match = {
      id: "peanut_butter",
      name: "Peanut butter",
      gramsPerCup: 258,
      allergens: ["peanuts"],
      allergensReviewed: true,
      dietTags: ["vegan"],
    };
    expect(catalogMatchSchema.parse(match)).toEqual(match);
  });

  it.each([
    { id: "Bad ID" },
    { id: "../x" },
    { id: "" },
    { id: "a".repeat(101) },
    { id: "flour", gramsPerCup: 0 },
    { id: "flour", gramsPerCup: 1001 },
    { id: "flour", gramsPerCup: Number.NaN },
    { id: "flour", gramsPerPiece: 5001 },
    { id: "flour", gramsPerPiece: -1 },
    { id: "flour", name: "<script>alert(1)</script>" },
    { id: "flour", name: "a".repeat(101) },
    { id: "flour", name: "" },
    { id: "flour", allergens: ["gluten"] },
    { id: "flour", allergens: ["wheat", "wheat"] },
    { id: "flour", allergens: "wheat" },
    { id: "flour", allergensReviewed: "yes" },
    { id: "flour", dietTags: ["paleo"] },
    { id: "flour", dietTags: ["vegan", "vegan"] },
  ])("rejects %p", (match) => {
    expect(catalogMatchSchema.safeParse(match).success).toBe(false);
  });
});
