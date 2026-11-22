import { makeIngredient } from "@/testing/ingredientFixtures";
import { findCheckedMatch } from "../checkedCatalogMatch";
import type { CatalogMatch, IngredientCatalog } from "../IngredientCatalog";
import { buildIngredientCatalog } from "../ingredientCatalogIndex";

// A fake catalog that answers every row with `value`, whatever it is.
const catalogReturning = (value: unknown): IngredientCatalog => ({ find: () => value as CatalogMatch });

describe("findCheckedMatch", () => {
  const catalog = buildIngredientCatalog([
    makeIngredient("milk_whole", "Whole milk", { aliases: ["milk"], allergens: ["milk"] }),
  ]);

  it("returns the catalog's match when it passes the check", () => {
    expect(findCheckedMatch(catalog, { name: "Milk" })).toEqual({
      id: "milk_whole",
      name: "Whole milk",
      allergens: ["milk"],
      allergensReviewed: false,
      dietTags: [],
    });
  });

  it("is undefined when the catalog has no match", () => {
    expect(findCheckedMatch(catalog, { name: "Hoisin sauce" })).toBeUndefined();
  });

  it("asks the catalog with only the row's ingredientId and name", () => {
    const find = jest.fn(() => undefined);
    const row = { ingredientId: "flour", name: "Flour", quantity: 2, unit: "cup" };
    findCheckedMatch({ find }, row);
    expect(find).toHaveBeenCalledWith({ ingredientId: "flour", name: "Flour" });
  });

  it.each([
    ["an ID outside the pattern", { id: "Bad ID" }],
    ["a path in the ID", { id: "../milk" }],
    ["an allergen that isn't on the list", { id: "x", allergens: ["gluten"] }],
    ["a repeated allergen", { id: "x", allergens: ["milk", "milk"] }],
    ["allergens that aren't a list", { id: "x", allergens: "milk" }],
    ["a reviewed flag that isn't true or false", { id: "x", allergensReviewed: "yes" }],
    ["a diet that isn't on the list", { id: "x", dietTags: ["carnivore"] }],
    ["a density of zero", { id: "x", gramsPerCup: 0 }],
    ["null", null],
    ["a string", "milk_whole"],
    ["a number", 42],
    ["a list", []],
  ])("treats %s as no match", (_label, value) => {
    expect(findCheckedMatch(catalogReturning(value), { name: "Milk" })).toBeUndefined();
  });

  it("treats a catalog that throws as no match, without crashing", () => {
    const throwing: IngredientCatalog = {
      find: () => {
        throw new Error("storage failed");
      },
    };
    expect(findCheckedMatch(throwing, { name: "Milk" })).toBeUndefined();
  });

  it("hands out a frozen copy, so nobody can change the catalog's data", () => {
    const match = findCheckedMatch(catalogReturning({ id: "x", allergens: ["milk"], dietTags: ["vegan"] }), { name: "X" });
    expect(Object.isFrozen(match)).toBe(true);
    expect(Object.isFrozen(match?.allergens)).toBe(true);
    expect(Object.isFrozen(match?.dietTags)).toBe(true);
  });

  it("checks a frozen match once and hands back the same checked copy", () => {
    const first = findCheckedMatch(catalog, { name: "Milk" });
    const second = findCheckedMatch(catalog, { name: "Whole milk" });
    expect(second).toBe(first);
  });

  it("remembers that a frozen match failed the check", () => {
    const bad = catalogReturning(Object.freeze({ id: "Bad ID" }));
    expect(findCheckedMatch(bad, { name: "X" })).toBeUndefined();
    expect(findCheckedMatch(bad, { name: "X" })).toBeUndefined();
  });

  it("checks a match that isn't frozen every time, so a later change is caught", () => {
    const match = { id: "x", allergens: ["milk"] };
    const fake = catalogReturning(match);
    expect(findCheckedMatch(fake, { name: "X" })?.allergens).toEqual(["milk"]);
    match.allergens.push("gluten");
    expect(findCheckedMatch(fake, { name: "X" })).toBeUndefined();
  });

  it("checks a frozen match again when its lists can still change", () => {
    const allergens = ["milk"];
    const fake = catalogReturning(Object.freeze({ id: "x", allergens }));
    expect(findCheckedMatch(fake, { name: "X" })?.allergens).toEqual(["milk"]);
    allergens.push("gluten");
    expect(findCheckedMatch(fake, { name: "X" })).toBeUndefined();
  });
});
