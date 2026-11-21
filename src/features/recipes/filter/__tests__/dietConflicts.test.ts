import type { Allergen, DietTag } from "@/repositories/IngredientCatalog";
import { ALLERGENS, DIET_TAGS } from "@/validation/recipeSchema";
import { conflictingDiets, DIET_CONFLICTS } from "../dietConflicts";

const ENTRIES = DIET_TAGS.flatMap((diet) => DIET_CONFLICTS[diet].map((allergen) => [diet, allergen] as const));

describe("DIET_CONFLICTS", () => {
  it("has an entry for every diet, as agreed", () => {
    expect(DIET_CONFLICTS).toEqual({
      vegan: ["milk", "eggs", "fish", "shellfish"],
      vegetarian: ["fish", "shellfish"],
      pescatarian: [],
      keto_friendly: [],
      gluten_free: ["wheat"],
      dairy_free: ["milk"],
    });
    expect(Object.keys(DIET_CONFLICTS).sort()).toEqual([...DIET_TAGS].sort());
  });

  it("can't be changed", () => {
    expect(Object.isFrozen(DIET_CONFLICTS)).toBe(true);
    for (const diet of DIET_TAGS) expect(Object.isFrozen(DIET_CONFLICTS[diet])).toBe(true);
  });
});

describe("conflictingDiets", () => {
  it.each(ENTRIES)("a recipe tagged %s that contains %s conflicts", (diet, allergen) => {
    expect(conflictingDiets([diet], [allergen])).toEqual([{ diet, allergens: [allergen] }]);
  });

  it.each(DIET_TAGS)("a recipe tagged %s doesn't conflict with allergens its diet allows", (diet: DietTag) => {
    const allowed = ALLERGENS.filter((allergen) => !DIET_CONFLICTS[diet].includes(allergen));
    expect(conflictingDiets([diet], allowed)).toEqual([]);
  });

  it("lists every conflicting allergen, in the order given", () => {
    expect(conflictingDiets(["vegan"], ["milk", "eggs", "wheat"])).toEqual([{ diet: "vegan", allergens: ["milk", "eggs"] }]);
  });

  it("checks each of the recipe's diets", () => {
    expect(conflictingDiets(["vegan", "vegetarian", "keto_friendly"], ["fish"])).toEqual([
      { diet: "vegan", allergens: ["fish"] },
      { diet: "vegetarian", allergens: ["fish"] },
    ]);
  });

  it("an untagged recipe or one with no allergens has no conflicts", () => {
    expect(conflictingDiets([], [...ALLERGENS])).toEqual([]);
    expect(conflictingDiets([...DIET_TAGS], [])).toEqual([]);
  });

  it("ignores a diet it doesn't know instead of crashing", () => {
    expect(conflictingDiets(["carnivore" as DietTag], ["milk" as Allergen])).toEqual([]);
  });
});
