import { dietaryRestrictionsSchema, storedProfileSchema } from "../profileSchema";
import { ALLERGENS, DIET_TAGS } from "../recipeSchema";

const ATTACK_STRINGS = [
  "'; DROP TABLE recipes;--",
  "<script>alert(1)</script>",
  "a".repeat(10_000),
  "",
  "🍕",
  "milk​", // zero-width space
  "‮milk", // right-to-left override
];

const accepts = (input: unknown) => dietaryRestrictionsSchema.safeParse(input).success;

describe("dietaryRestrictionsSchema", () => {
  it("accepts valid choices", () => {
    expect(dietaryRestrictionsSchema.parse({ allergens: ["milk", "peanuts"], diets: ["vegan"] })).toEqual({
      allergens: ["peanuts", "milk"], // vocabulary order
      diets: ["vegan"],
    });
  });

  it("accepts empty lists, which mean 'none'", () => {
    expect(dietaryRestrictionsSchema.parse({ allergens: [], diets: [] })).toEqual({ allergens: [], diets: [] });
  });

  it("does not accept null: 'not set yet' lives on the profile, not here", () => {
    expect(accepts(null)).toBe(false);
  });

  it("removes duplicates", () => {
    expect(dietaryRestrictionsSchema.parse({ allergens: ["milk", "milk"], diets: ["vegan", "vegan"] })).toEqual({
      allergens: ["milk"],
      diets: ["vegan"],
    });
  });

  it("accepts every value once, but not more items than the vocabulary has", () => {
    expect(accepts({ allergens: [...ALLERGENS], diets: [...DIET_TAGS] })).toBe(true);
    expect(accepts({ allergens: [...ALLERGENS, "milk"], diets: [] })).toBe(false);
    expect(accepts({ allergens: [], diets: [...DIET_TAGS, "vegan"] })).toBe(false);
    expect(accepts({ allergens: Array(10_000).fill("milk"), diets: [] })).toBe(false);
  });

  it.each(["Milk", "MILK", "milk ", "lactose", "keto_friendly"])("rejects allergen %p", (allergen) => {
    expect(accepts({ allergens: [allergen], diets: [] })).toBe(false);
  });

  it.each(["Vegan", "paleo", "peanuts"])("rejects diet %p", (diet) => {
    expect(accepts({ allergens: [], diets: [diet] })).toBe(false);
  });

  it.each(ATTACK_STRINGS)("rejects attack input %#", (attack) => {
    expect(accepts({ allergens: [attack], diets: [] })).toBe(false);
    expect(accepts({ allergens: [], diets: [attack] })).toBe(false);
  });

  it("rejects missing lists and wrong types", () => {
    expect(accepts({ allergens: [] })).toBe(false);
    expect(accepts({ allergens: "milk", diets: [] })).toBe(false);
    expect(accepts({ allergens: [1], diets: [] })).toBe(false);
  });
});

describe("storedProfileSchema", () => {
  const valid = {
    username: "levi_f",
    dietaryRestrictions: { allergens: ["sesame"], diets: [] },
    createdAt: Date.UTC(2026, 9, 1),
    updatedAt: Date.UTC(2026, 9, 2),
    schemaVersion: 1,
  };

  it("accepts a valid profile and drops unknown fields", () => {
    const result = storedProfileSchema.safeParse({ ...valid, uid: "other", isAdmin: true, email: "x@y.co" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(valid);
  });

  it("accepts null restrictions (not set yet)", () => {
    expect(storedProfileSchema.safeParse({ ...valid, dietaryRestrictions: null }).success).toBe(true);
  });

  it.each([
    { username: "Levi" },
    { username: "levi f" },
    { username: "<script>alert(1)</script>" },
    { username: "'; DROP TABLE recipes;--" },
    { dietaryRestrictions: undefined },
    { dietaryRestrictions: { allergens: ["gluten"], diets: [] } },
    { createdAt: "2026-10-01" },
    { createdAt: 1.5 },
    { updatedAt: Date.UTC(2101, 0, 1) },
    { updatedAt: Date.UTC(2026, 8, 30) }, // before createdAt
    { schemaVersion: 2 },
  ])("rejects %p", (patch) => {
    expect(storedProfileSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});
