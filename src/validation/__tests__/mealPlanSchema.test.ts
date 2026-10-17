import {
  dateKeySchema,
  mealPlanEntryIdSchema,
  mealPlanEntrySchema,
  mealPlanEntryUpdateSchema,
  plannerSlotParamsSchema,
} from "../mealPlanSchema";

const valid = {
  date: "2026-10-19",
  mealType: "dinner",
  recipeId: "mgw3k2-a1b2c3d4",
  servings: 4,
};

const ATTACK_STRINGS = [
  "'; DROP TABLE recipes;--",
  "<script>alert(1)</script>",
  "a".repeat(10_000),
  "",
  "🍕",
  "abc​", // zero-width space
  "‮abc", // right-to-left override
  "a/b",
  "../x",
  "Recipe ID",
  "ABC",
];

const accepts = (input: unknown) => mealPlanEntrySchema.safeParse(input).success;

describe("mealPlanEntrySchema", () => {
  it("accepts a valid entry and returns it unchanged", () => {
    const result = mealPlanEntrySchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(valid);
  });

  it("drops fields that are not in the schema", () => {
    const result = mealPlanEntrySchema.safeParse({ ...valid, isAdmin: true, deletedAt: 1 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(valid);
  });

  it.each([
    [1, true],
    [100, true],
    [0, false],
    [101, false],
    [-1, false],
    [2.5, false],
    [NaN, false],
    [Infinity, false],
    ["4", false],
    [undefined, false],
  ])("servings %p -> %p", (servings, ok) => {
    expect(accepts({ ...valid, servings })).toBe(ok);
  });

  it.each([
    ["breakfast", true],
    ["lunch", true],
    ["dinner", true],
    ["snack", false], // a recipe tag, not a planner slot
    ["Dinner", false],
    ["dinner ", false],
  ])("mealType %p -> %p", (mealType, ok) => {
    expect(accepts({ ...valid, mealType })).toBe(ok);
  });

  it.each(ATTACK_STRINGS)("rejects attack input %#", (attack) => {
    expect(accepts({ ...valid, recipeId: attack })).toBe(false);
    expect(accepts({ ...valid, date: attack })).toBe(false);
    expect(accepts({ ...valid, mealType: attack })).toBe(false);
  });

  it("rejects non-string IDs and missing fields", () => {
    expect(accepts({ ...valid, recipeId: 42 })).toBe(false);
    expect(accepts({ ...valid, recipeId: undefined })).toBe(false);
    expect(accepts({})).toBe(false);
    expect(accepts(null)).toBe(false);
  });
});

describe("dateKeySchema", () => {
  it.each([
    ["2026-10-19", true],
    ["2026-02-28", true],
    ["2026-02-29", false], // 2026 is not a leap year
    ["2028-02-29", true],
    ["2026-04-31", false],
    ["2026-13-01", false],
    ["2026-00-10", false],
    ["2026-10-00", false],
    ["2000-01-01", true], // range start
    ["2100-12-31", true], // range end
    ["1999-12-31", false],
    ["2101-01-01", false],
    ["2026-1-5", false],
    ["20261019", false],
    ["2026-10-19T00:00", false],
    [" 2026-10-19", false],
    ["２０２６-１０-１９", false], // full-width digits
  ])("%p -> %p", (key, ok) => {
    expect(dateKeySchema.safeParse(key).success).toBe(ok);
  });
});

describe("mealPlanEntryUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(mealPlanEntryUpdateSchema.safeParse({ servings: 2 }).data).toEqual({ servings: 2 });
    expect(mealPlanEntryUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("never passes recipeId through, so the recipe cannot be changed", () => {
    expect(mealPlanEntryUpdateSchema.safeParse({ recipeId: "other" }).data).toEqual({});
  });

  it("validates the fields it does accept", () => {
    expect(mealPlanEntryUpdateSchema.safeParse({ servings: 0 }).success).toBe(false);
    expect(mealPlanEntryUpdateSchema.safeParse({ date: "2026-02-30" }).success).toBe(false);
    expect(mealPlanEntryUpdateSchema.safeParse({ mealType: "snack" }).success).toBe(false);
  });
});

describe("route param schemas", () => {
  it("accepts a valid slot", () => {
    expect(plannerSlotParamsSchema.safeParse({ date: "2026-10-19", mealType: "lunch" }).success).toBe(true);
  });

  it("rejects repeated query params (string arrays)", () => {
    expect(
      plannerSlotParamsSchema.safeParse({ date: ["2026-10-19", "2026-10-20"], mealType: "lunch" }).success,
    ).toBe(false);
  });

  it.each(ATTACK_STRINGS)("rejects attack input as an entry ID %#", (attack) => {
    expect(mealPlanEntryIdSchema.safeParse(attack).success).toBe(false);
  });
});
