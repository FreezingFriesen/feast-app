import { makeIngredient, manyIngredients } from "@/testing/ingredientFixtures";
import { catalogMatchSchema, storedIngredientSchema } from "@/validation/ingredientSchema";
import { buildIngredientCatalog, findNameCollisions } from "../ingredientCatalogIndex";

const FLOUR = makeIngredient("all_purpose_flour", "All-purpose flour", {
  aliases: ["flour", "white flour"],
  gramsPerCup: 125,
  allergens: ["wheat"],
  dietTags: ["vegan"],
});
const MILK = makeIngredient("milk_whole", "Whole milk", { aliases: ["milk"], gramsPerCup: 240, allergens: ["milk"] });
const EGG = makeIngredient("egg_whole_raw", "Egg, whole, raw", {
  aliases: ["eggs", "large egg"],
  gramsPerPiece: 50,
  pieceDescription: "1 large egg, shelled",
  allergens: ["eggs"],
  allergensReviewed: true,
});
const BUTTER = makeIngredient("butter", "Butter", { gramsPerCup: 227, allergens: ["milk"] });
const PEANUT_BUTTER = makeIngredient("peanut_butter", "Peanut butter", { allergens: ["peanuts"], allergensReviewed: true });
const CREME_FRAICHE = makeIngredient("creme_fraiche", "Crème fraîche", { allergens: ["milk"] });

const catalog = buildIngredientCatalog([FLOUR, MILK, EGG, BUTTER, PEANUT_BUTTER, CREME_FRAICHE]);
const idOf = (row: { ingredientId?: string; name: string }) => catalog.find(row)?.id;

describe("buildIngredientCatalog: find", () => {
  it("matches by ingredientId", () => {
    expect(idOf({ ingredientId: "milk_whole", name: "Something else" })).toBe("milk_whole");
  });

  it("matches by name and by alias", () => {
    expect(idOf({ name: "All-purpose flour" })).toBe("all_purpose_flour");
    expect(idOf({ name: "white flour" })).toBe("all_purpose_flour");
    expect(idOf({ name: "eggs" })).toBe("egg_whole_raw");
  });

  it("ignores case and extra spaces", () => {
    expect(idOf({ name: "  Whole MILK " })).toBe("milk_whole");
    expect(idOf({ name: "WHITE    flour" })).toBe("all_purpose_flour");
  });

  it("matches an accent typed either way (NFC), but never drops accents", () => {
    expect(idOf({ name: "Crème fraîche" })).toBe("creme_fraiche"); // decomposed
    expect(idOf({ name: "crème fraîche" })).toBe("creme_fraiche");
    expect(idOf({ name: "creme fraiche" })).toBeUndefined();
  });

  it("removes invisible characters before matching", () => {
    expect(idOf({ name: "Mi​lk" })).toBe("milk_whole");
  });

  it.each(["Bad ID", "../x", "", "a".repeat(101), "MILK_WHOLE"])("falls back to the name for an invalid ingredientId %p", (ingredientId) => {
    expect(idOf({ ingredientId, name: "flour" })).toBe("all_purpose_flour");
  });

  it("falls back to the name for a valid ingredientId the catalog doesn't have", () => {
    expect(idOf({ ingredientId: "old_flour_id", name: "Flour" })).toBe("all_purpose_flour");
  });

  it("prefers the ingredientId over the name", () => {
    expect(idOf({ ingredientId: "butter", name: "Peanut butter" })).toBe("butter");
  });

  it("never matches part of a name: peanut butter is not butter, and butter is not peanut butter", () => {
    expect(idOf({ name: "butter" })).toBe("butter");
    expect(idOf({ name: "peanut butter" })).toBe("peanut_butter");
    expect(buildIngredientCatalog([BUTTER]).find({ name: "peanut butter" })).toBeUndefined();
    expect(buildIngredientCatalog([PEANUT_BUTTER]).find({ name: "butter" })).toBeUndefined();
    expect(idOf({ name: "unsalted butter" })).toBeUndefined();
    expect(idOf({ name: "flou" })).toBeUndefined();
  });

  it("doesn't guess plurals: 'eggs' matches through its alias, 'egg' doesn't", () => {
    expect(idOf({ name: "eggs" })).toBe("egg_whole_raw");
    expect(idOf({ name: "egg" })).toBeUndefined();
  });

  it("matches nothing for a row whose name isn't text (a corrupted recipe)", () => {
    expect(catalog.find({ name: undefined as unknown as string })).toBeUndefined();
    expect(catalog.find({ ingredientId: 7 as unknown as string, name: "flour" })?.id).toBe("all_purpose_flour");
  });

  it("matches nothing with no data", () => {
    expect(buildIngredientCatalog([]).find({ name: "flour" })).toBeUndefined();
    expect(buildIngredientCatalog([]).find({ ingredientId: "all_purpose_flour", name: "flour" })).toBeUndefined();
  });

  it("hands out the ingredient's name, conversion data and safety tags, which pass catalogMatchSchema", () => {
    const match = catalog.find({ name: "eggs" });
    expect(match).toEqual({
      id: "egg_whole_raw",
      name: "Egg, whole, raw",
      gramsPerPiece: 50,
      allergens: ["eggs"],
      allergensReviewed: true,
      dietTags: [],
    });
    expect(catalogMatchSchema.parse(match)).toEqual(match);
    // Unknown conversion data is left out, not set to undefined.
    expect(Object.keys(catalog.find({ name: "butter" }) ?? {})).not.toContain("gramsPerPiece");
  });

  it("keeps 'allergens not reviewed' as it is (unknown, never safe)", () => {
    expect(catalog.find({ name: "flour" })).toMatchObject({ allergens: ["wheat"], allergensReviewed: false });
  });

  it("hands out the same frozen object every time, so nobody can change it", () => {
    const first = catalog.find({ name: "flour" });
    expect(catalog.find({ ingredientId: "all_purpose_flour", name: "x" })).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first?.allergens)).toBe(true);
    expect(Object.isFrozen(catalog)).toBe(true);
  });

  it("isn't changed by later changes to the list it was built from", () => {
    const ingredients = [makeIngredient("salt", "Salt")];
    const built = buildIngredientCatalog(ingredients);
    ingredients[0].name = "Pepper";
    ingredients.push(makeIngredient("pepper", "Pepper"));
    expect(built.find({ name: "salt" })?.id).toBe("salt");
    expect(built.find({ name: "pepper" })).toBeUndefined();
  });
});

describe("names shared by different ingredients", () => {
  const RICE_FLOUR = makeIngredient("rice_flour", "Rice flour", { aliases: ["gluten free flour"] });
  const GF_BLEND = makeIngredient("gluten_free_blend", "Gluten-free flour blend", { aliases: ["Gluten  free FLOUR"] });

  it("match nothing, because a wrong match is worse than none", () => {
    const shared = buildIngredientCatalog([RICE_FLOUR, GF_BLEND]);
    expect(shared.find({ name: "gluten free flour" })).toBeUndefined();
    // Each one's own name still matches.
    expect(shared.find({ name: "Rice flour" })?.id).toBe("rice_flour");
    expect(shared.find({ name: "gluten-free flour blend" })?.id).toBe("gluten_free_blend");
    // And the ID still works.
    expect(shared.find({ ingredientId: "rice_flour", name: "gluten free flour" })?.id).toBe("rice_flour");
  });

  it("stays ambiguous however many ingredients share the name", () => {
    const three = [
      makeIngredient("milk_whole", "Whole milk", { aliases: ["milk"] }),
      makeIngredient("milk_skim", "Skim milk", { aliases: ["milk"] }),
      makeIngredient("milk_oat", "Oat milk", { aliases: ["Milk"] }),
    ];
    expect(buildIngredientCatalog(three).find({ name: "milk" })).toBeUndefined();
    expect(findNameCollisions(three)).toEqual([{ key: "milk", ids: ["milk_oat", "milk_skim", "milk_whole"] }]);
  });

  it("a name that is another ingredient's alias is ambiguous too", () => {
    const shared = buildIngredientCatalog([makeIngredient("milk_whole", "Milk"), makeIngredient("milk_skim", "Skim milk", { aliases: ["milk"] })]);
    expect(shared.find({ name: "milk" })).toBeUndefined();
  });

  it("are listed, so the data can be fixed", () => {
    expect(findNameCollisions([FLOUR, RICE_FLOUR, GF_BLEND, makeIngredient("flour_bread", "Bread flour", { aliases: ["Flour"] })])).toEqual([
      { key: "flour", ids: ["all_purpose_flour", "flour_bread"] },
      { key: "gluten free flour", ids: ["gluten_free_blend", "rice_flour"] },
    ]);
  });

  it("the same name twice within one ingredient is not a collision", () => {
    const whiteBread = makeIngredient("bread_white", "White bread", { aliases: ["white bread", "WHITE BREAD"] });
    const brownSugar = makeIngredient("sugar_brown", "Brown sugar", { aliases: ["brown sugar"] });
    expect(findNameCollisions([whiteBread, brownSugar])).toEqual([]);
    const built = buildIngredientCatalog([whiteBread, brownSugar]);
    expect(built.find({ name: "white bread" })?.id).toBe("bread_white");
    expect(built.find({ name: "Brown Sugar" })?.id).toBe("sugar_brown");
  });

  it("the test data here has none", () => {
    expect(findNameCollisions([FLOUR, MILK, EGG, BUTTER, PEANUT_BUTTER, CREME_FRAICHE])).toEqual([]);
  });
});

describe("performance", () => {
  // 2,000 ingredients (the most the app keeps) with 10 aliases each.
  const big = manyIngredients(2000, 10);

  it("the test data is valid", () => {
    expect(storedIngredientSchema.safeParse(big[1999]).success).toBe(true);
  });

  it("builds the index for 2,000 ingredients with 10 aliases each in 50 ms or less", () => {
    // One build to warm up, then the median of three, so a slow moment on the test
    // machine doesn't decide the result.
    buildIngredientCatalog(big);
    const times = [0, 1, 2].map(() => {
      const started = performance.now();
      const built = buildIngredientCatalog(big);
      const elapsed = performance.now() - started;
      expect(built.find({ name: "Ingredient 1999 alias 9" })?.id).toBe("item_1999");
      return elapsed;
    });
    expect(times.sort((a, b) => a - b)[1]).toBeLessThanOrEqual(50);
  });

  it("finds in constant time: 100,000 lookups stay fast", () => {
    const built = buildIngredientCatalog(big);
    const started = performance.now();
    for (let i = 0; i < 100_000; i += 1) built.find({ ingredientId: `item_${String(i % 2000).padStart(4, "0")}`, name: "x" });
    expect(performance.now() - started).toBeLessThan(500);
  });
});
