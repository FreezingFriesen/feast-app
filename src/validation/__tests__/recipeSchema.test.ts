import { recipeSchema, storedRecipeSchema } from "../recipeSchema";

const ingredient = { name: "Flour", quantity: 200, unit: "g" };

const valid = {
  title: "Pancakes",
  servings: 4,
  ingredients: [ingredient],
  steps: ["Mix", "Cook"],
};

const ATTACK_STRINGS = [
  "'; DROP TABLE recipes;--",
  "<script>alert(1)</script>",
  "a".repeat(10_000),
  "🍕",
];

const accepts = (input: unknown) => recipeSchema.safeParse(input).success;
const parse = (patch: object) => recipeSchema.parse({ ...valid, ...patch });

describe("recipeSchema", () => {
  it("accepts a minimal recipe and fills in empty tag lists", () => {
    expect(recipeSchema.parse(valid)).toEqual({ ...valid, mealTypes: [], dietTags: [] });
  });

  it("accepts every optional field", () => {
    const full = {
      ...valid,
      description: "Fluffy",
      prepTimeMinutes: 0,
      cookTimeMinutes: 1440,
      mealTypes: ["breakfast"],
      ingredients: [{ ...ingredient, ingredientId: "all_purpose_flour", note: "sifted" }],
      dietTags: ["vegetarian"],
      notes: "Serve warm",
    };
    expect(recipeSchema.parse(full)).toEqual(full);
  });

  it("drops fields that are not in the schema", () => {
    expect(parse({ id: "x", isAdmin: true, createdAt: 1 })).toEqual(parse({}));
  });

  it("removes duplicate tags and stores them in vocabulary order", () => {
    const result = parse({ mealTypes: ["dinner", "breakfast", "dinner"], dietTags: ["vegan", "keto_friendly", "vegan"] });
    expect(result.mealTypes).toEqual(["breakfast", "dinner"]);
    expect(result.dietTags).toEqual(["vegan", "keto_friendly"]);
  });

  it("limits the raw tag lists before removing duplicates", () => {
    expect(accepts({ ...valid, mealTypes: ["breakfast", "lunch", "dinner", "snack"] })).toBe(true);
    expect(accepts({ ...valid, mealTypes: Array(5).fill("lunch") })).toBe(false);
    expect(accepts({ ...valid, dietTags: Array(7).fill("vegan") })).toBe(false);
  });

  it.each([
    ["mealTypes", ["brunch"]],
    ["mealTypes", ["Dinner"]],
    ["dietTags", ["paleo"]],
    ["dietTags", "vegan"],
  ])("rejects %s %p", (field, value) => {
    expect(accepts({ ...valid, [field]: value })).toBe(false);
  });

  it.each([
    ["Crème brûlée", true],
    ["Mom’s Mac & Cheese (50/50)", true],
    ["a".repeat(100), true],
    ["a".repeat(101), false],
    ["", false],
    ["   ", false],
    ["🍕 Pizza", false],
    ["Pizza; DROP", false],
  ])("title %p -> %p", (title, ok) => {
    expect(accepts({ ...valid, title })).toBe(ok);
  });

  it("cleans the title before checking it", () => {
    expect(parse({ title: "  Pan​cakes  " }).title).toBe("Pancakes"); // zero-width space
    expect(accepts({ ...valid, title: "‮" })).toBe(false); // only a right-to-left override
  });

  // firestore.rules counts the same way (see validText there).
  it("counts length in code points, so an emoji counts as one character", () => {
    expect(accepts({ ...valid, description: "🍕".repeat(500) })).toBe(true);
    expect(accepts({ ...valid, description: "🍕".repeat(501) })).toBe(false);
    expect(accepts({ ...valid, title: "𠀀".repeat(100) })).toBe(true); // a letter outside the BMP
    expect(accepts({ ...valid, title: "𠀀".repeat(101) })).toBe(false);
  });

  it.each([
    [1, true],
    [100, true],
    [0, false],
    [101, false],
    [2.5, false],
    [NaN, false],
    ["4", false],
    [undefined, false],
  ])("servings %p -> %p", (servings, ok) => {
    expect(accepts({ ...valid, servings })).toBe(ok);
  });

  it.each([
    [0, true],
    [1440, true],
    [-1, false],
    [1441, false],
    [1.5, false],
  ])("prepTimeMinutes %p -> %p", (prepTimeMinutes, ok) => {
    expect(accepts({ ...valid, prepTimeMinutes })).toBe(ok);
  });

  it("limits the number of ingredients and steps", () => {
    expect(accepts({ ...valid, ingredients: Array(50).fill(ingredient) })).toBe(true);
    expect(accepts({ ...valid, ingredients: Array(51).fill(ingredient) })).toBe(false);
    expect(accepts({ ...valid, ingredients: [] })).toBe(false);
    expect(accepts({ ...valid, steps: Array(50).fill("Stir") })).toBe(true);
    expect(accepts({ ...valid, steps: Array(51).fill("Stir") })).toBe(false);
    expect(accepts({ ...valid, steps: [] })).toBe(false);
  });

  it.each([
    { quantity: 0 },
    { quantity: -1 },
    { quantity: 100_001 },
    { quantity: NaN },
    { unit: "handful" },
    { unit: undefined },
    { name: "" },
    { name: "<b>Flour</b>" },
  ])("rejects ingredient %p", (patch) => {
    expect(accepts({ ...valid, ingredients: [{ ...ingredient, ...patch }] })).toBe(false);
  });

  it.each(ATTACK_STRINGS)("rejects attack input as a title or ingredient name %#", (attack) => {
    expect(accepts({ ...valid, title: attack })).toBe(false);
    expect(accepts({ ...valid, ingredients: [{ ...ingredient, name: attack }] })).toBe(false);
  });

  it.each(["'; DROP TABLE recipes;--", "<script>alert(1)</script>"])(
    "keeps attack input in free text as plain text %#",
    (attack) => {
      const result = parse({ description: attack, steps: [attack], notes: attack });
      expect(result.description).toBe(attack);
      expect(result.steps).toEqual([attack]);
      expect(result.notes).toBe(attack);
    },
  );

  it("limits free text length", () => {
    expect(accepts({ ...valid, description: "a".repeat(501) })).toBe(false);
    expect(accepts({ ...valid, notes: "a".repeat(1001) })).toBe(false);
    expect(accepts({ ...valid, steps: ["a".repeat(1001)] })).toBe(false);
    expect(accepts({ ...valid, steps: [""] })).toBe(false);
  });

  it("rejects missing fields and wrong types", () => {
    expect(accepts({})).toBe(false);
    expect(accepts(null)).toBe(false);
    expect(accepts({ ...valid, title: undefined })).toBe(false);
    expect(accepts({ ...valid, steps: "Mix" })).toBe(false);
  });
});

describe("storedRecipeSchema", () => {
  const stored = {
    ...valid,
    mealTypes: ["dinner"],
    dietTags: [],
    createdAt: Date.UTC(2026, 9, 1),
    updatedAt: Date.UTC(2026, 9, 2),
    schemaVersion: 1,
  };
  const acceptsStored = (input: unknown) => storedRecipeSchema.safeParse(input).success;

  it("accepts a saved recipe, deleted or not, and drops the id and unknown fields", () => {
    const result = storedRecipeSchema.safeParse({ ...stored, id: "abc", isAdmin: true });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(stored);
    expect(acceptsStored({ ...stored, deletedAt: Date.UTC(2026, 9, 2) })).toBe(true);
  });

  it("accepts the same optional fields as the Security Rules", () => {
    expect(
      acceptsStored({ ...stored, description: "", prepTimeMinutes: 0, cookTimeMinutes: 1440, notes: "Warm" }),
    ).toBe(true);
  });

  it("stores tags in vocabulary order", () => {
    expect(storedRecipeSchema.parse({ ...stored, mealTypes: ["dinner", "breakfast"] }).mealTypes).toEqual([
      "breakfast",
      "dinner",
    ]);
  });

  it.each([
    { mealTypes: undefined }, // required here (the form's default doesn't apply)
    { dietTags: undefined },
    { mealTypes: ["dinner", "dinner"] }, // the Rules refuse duplicates
    { dietTags: ["vegan", "vegan"] },
    { createdAt: undefined },
    { createdAt: "2026-10-01" },
    { createdAt: 1.5 },
    { createdAt: Date.UTC(2019, 11, 31) },
    { updatedAt: Date.UTC(2101, 0, 1) },
    { updatedAt: Date.UTC(2026, 8, 30) }, // before createdAt
    { deletedAt: null },
    { deletedAt: -1 },
    { schemaVersion: 2 },
    { schemaVersion: undefined },
    { title: "'; DROP TABLE recipes;--" },
    { title: "<script>alert(1)</script>" },
    { ingredients: [{ name: "Flour", quantity: 1, unit: "handful" }] },
  ])("rejects %p", (patch) => {
    expect(acceptsStored({ ...stored, ...patch })).toBe(false);
  });

  it("cleans text read back the same way as the form does", () => {
    expect(storedRecipeSchema.parse({ ...stored, title: " Pan​cakes " }).title).toBe("Pancakes");
  });
});
