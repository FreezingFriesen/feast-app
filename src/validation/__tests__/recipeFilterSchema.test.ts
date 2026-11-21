import { ALLERGENS, DIET_TAGS, MEAL_TYPES } from "../recipeSchema";
import { DEFAULT_RECIPE_FILTER, RECIPE_SORTS, recipeFilterSchema } from "../recipeFilterSchema";

const VALID = { diets: [], excludeAllergens: [], mealTypes: [], hideUnchecked: false, sort: "newest" };

const parse = (patch: Record<string, unknown>) => recipeFilterSchema.safeParse({ ...VALID, ...patch });

// Values that must never select a diet, allergen, meal type or sort.
const ATTACKS: unknown[] = [
  "'; DROP TABLE recipes;--",
  "<script>alert(1)</script>",
  "__proto__",
  "constructor",
  "x".repeat(10_000),
  "🥜",
  "Vegan",
  "vegan ",
  "VEGAN",
  "milk​",
  "",
  null,
  undefined,
  0,
  1,
  true,
  {},
  [],
  { toString: () => "vegan" },
];

describe("recipeFilterSchema", () => {
  it("accepts the default filter", () => {
    expect(recipeFilterSchema.parse(DEFAULT_RECIPE_FILTER)).toEqual(DEFAULT_RECIPE_FILTER);
  });

  it("accepts every diet, allergen, meal type and sort", () => {
    for (const sort of RECIPE_SORTS) {
      const result = parse({
        diets: [...DIET_TAGS],
        excludeAllergens: [...ALLERGENS],
        mealTypes: [...MEAL_TYPES],
        hideUnchecked: true,
        sort,
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        diets: [...DIET_TAGS],
        excludeAllergens: [...ALLERGENS],
        mealTypes: [...MEAL_TYPES],
        hideUnchecked: true,
        sort,
      });
    }
  });

  it("removes duplicates and sorts into vocabulary order", () => {
    const result = parse({
      diets: ["keto_friendly", "vegan", "keto_friendly"],
      excludeAllergens: ["wheat", "peanuts", "wheat"],
      mealTypes: ["dinner", "breakfast"],
    });
    expect(result.data).toMatchObject({
      diets: ["vegan", "keto_friendly"],
      excludeAllergens: ["peanuts", "wheat"],
      mealTypes: ["breakfast", "dinner"],
    });
  });

  it.each([
    ["diets", DIET_TAGS],
    ["excludeAllergens", ALLERGENS],
    ["mealTypes", MEAL_TYPES],
  ] as const)("accepts %s up to the size of its list and refuses one more", (field, vocabulary) => {
    expect(parse({ [field]: [...vocabulary] }).success).toBe(true);
    expect(parse({ [field]: [...vocabulary, vocabulary[0]] }).success).toBe(false);
  });

  it("refuses keys it doesn't know, including a prototype key", () => {
    expect(parse({ query: "pancakes" }).success).toBe(false);
    const polluted = JSON.parse(`{"__proto__": {"polluted": true}, ${JSON.stringify(VALID).slice(1)}`);
    expect(recipeFilterSchema.safeParse(polluted).success).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it.each(["diets", "excludeAllergens", "mealTypes", "hideUnchecked", "sort"])("refuses a filter without %s", (field) => {
    const input: Record<string, unknown> = { ...VALID };
    delete input[field];
    expect(recipeFilterSchema.safeParse(input).success).toBe(false);
  });

  it.each(ATTACKS)("refuses %p as a diet, allergen, meal type or sort", (value) => {
    expect(parse({ diets: [value] }).success).toBe(false);
    expect(parse({ excludeAllergens: [value] }).success).toBe(false);
    expect(parse({ mealTypes: [value] }).success).toBe(false);
    expect(parse({ sort: value }).success).toBe(false);
  });

  it("takes a value only in its own field: 'vegan' is a diet, not an allergen, meal type or sort", () => {
    expect(parse({ diets: ["vegan"] }).success).toBe(true);
    expect(parse({ excludeAllergens: ["vegan"] }).success).toBe(false);
    expect(parse({ mealTypes: ["vegan"] }).success).toBe(false);
    expect(parse({ sort: "vegan" }).success).toBe(false);
  });

  it.each(["true", 1, null, undefined])("refuses %p for hideUnchecked", (value) => {
    expect(parse({ hideUnchecked: value }).success).toBe(false);
  });

  it.each([null, undefined, "filters", 42, [], [VALID]])("refuses %p instead of a filter", (value) => {
    expect(recipeFilterSchema.safeParse(value).success).toBe(false);
  });

  it("refuses lists that aren't lists", () => {
    expect(parse({ diets: "vegan" }).success).toBe(false);
    expect(parse({ excludeAllergens: { 0: "milk" } }).success).toBe(false);
  });

  it("doesn't change the input", () => {
    const input = { ...VALID, diets: ["vegetarian", "vegan"] };
    recipeFilterSchema.parse(input);
    expect(input.diets).toEqual(["vegetarian", "vegan"]);
  });
});
