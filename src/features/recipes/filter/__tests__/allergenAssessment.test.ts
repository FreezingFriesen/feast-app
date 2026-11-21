import { emptyIngredientCatalog, type CatalogMatch, type IngredientCatalog } from "@/repositories/IngredientCatalog";
import { buildIngredientCatalog } from "@/repositories/ingredientCatalogIndex";
import { SAMPLE_INGREDIENTS } from "@/services/ingredients/sampleIngredients";
import { makeIngredient } from "@/testing/ingredientFixtures";
import { makeRecipe, row } from "@/testing/recipeFixtures";
import { assessRecipeAllergens } from "../allergenAssessment";

// The in-memory backend's 10 made-up ingredients. Only eggs and peanut butter are reviewed.
const SAMPLE = buildIngredientCatalog(SAMPLE_INGREDIENTS);

const recipeWith = (...names: string[]) => makeRecipe("r", {}, names);
const assess = (names: string[], catalog: IngredientCatalog = SAMPLE) => assessRecipeAllergens(recipeWith(...names), catalog);

describe("assessRecipeAllergens", () => {
  it("with no ingredient data, every row is unchecked and nothing is listed", () => {
    expect(assess(["Whole milk", "Eggs"], emptyIngredientCatalog)).toEqual({
      contains: [],
      unmatchedNames: ["Whole milk", "Eggs"],
      usesUnreviewedData: false,
      fullyChecked: false,
    });
  });

  it("counts an allergen listed by an unreviewed ingredient", () => {
    expect(assess(["Whole milk"])).toEqual({
      contains: ["milk"],
      unmatchedNames: [],
      usesUnreviewedData: true,
      fullyChecked: false,
    });
  });

  it("is fully checked only when every row matched a reviewed ingredient", () => {
    const reviewed = buildIngredientCatalog([makeIngredient("salt", "Salt", { allergensReviewed: true })]);
    expect(assess(["Salt"], reviewed)).toEqual({
      contains: [],
      unmatchedNames: [],
      usesUnreviewedData: false,
      fullyChecked: true,
    });
  });

  it("can be fully checked and still contain allergens", () => {
    expect(assess(["Eggs", "Peanut butter"])).toEqual({
      contains: ["peanuts", "eggs"],
      unmatchedNames: [],
      usesUnreviewedData: false,
      fullyChecked: true,
    });
  });

  it("one unreviewed or unmatched row is enough to make it not fully checked", () => {
    expect(assess(["Eggs", "White sugar"]).fullyChecked).toBe(false);
    expect(assess(["Eggs", "Hoisin sauce"]).fullyChecked).toBe(false);
  });

  it("matches 'Eggs' through its alias", () => {
    expect(assess(["Eggs"]).contains).toEqual(["eggs"]);
  });

  it("matches 'Flour' through the sample's alias, and leaves 'Hoisin sauce' unchecked", () => {
    expect(assess(["Flour", "Hoisin sauce"])).toMatchObject({ contains: ["wheat"], unmatchedNames: ["Hoisin sauce"] });
  });

  it("lists every row's allergens once, in ALLERGENS order", () => {
    expect(assess(["Soy sauce", "Butter", "Whole milk"]).contains).toEqual(["milk", "soy", "wheat"]);
  });

  it("matches by ingredientId first, then by name", () => {
    const byId = makeRecipe("a", { ingredients: [row("Mystery", { ingredientId: "milk_whole" })] });
    expect(assessRecipeAllergens(byId, SAMPLE).contains).toEqual(["milk"]);
    const unknownId = makeRecipe("b", { ingredients: [row("Whole milk", { ingredientId: "not_in_catalog" })] });
    expect(assessRecipeAllergens(unknownId, SAMPLE).contains).toEqual(["milk"]);
    const badId = makeRecipe("c", { ingredients: [row("Hoisin sauce", { ingredientId: "Bad ID" })] });
    expect(assessRecipeAllergens(badId, SAMPLE).unmatchedNames).toEqual(["Hoisin sauce"]);
  });

  it("treats a match that fails the check as unchecked, never as allergen-free", () => {
    const bad: IngredientCatalog = { find: () => ({ id: "x", allergens: ["gluten"] }) as unknown as CatalogMatch };
    expect(assess(["Bread"], bad)).toEqual({
      contains: [],
      unmatchedNames: ["Bread"],
      usesUnreviewedData: false,
      fullyChecked: false,
    });
  });

  it("treats a catalog that throws as unchecked, without crashing", () => {
    const throwing: IngredientCatalog = {
      find: () => {
        throw new Error("boom");
      },
    };
    expect(assess(["Whole milk"], throwing)).toMatchObject({ contains: [], unmatchedNames: ["Whole milk"] });
  });

  it("treats a name two ingredients share as unchecked", () => {
    const ambiguous = buildIngredientCatalog([
      makeIngredient("cream_heavy", "Heavy cream", { aliases: ["cream"], allergens: ["milk"] }),
      makeIngredient("cream_coconut", "Coconut cream", { aliases: ["cream"] }),
    ]);
    expect(assess(["Cream"], ambiguous)).toMatchObject({ contains: [], unmatchedNames: ["Cream"] });
  });

  it("names each unchecked ingredient once, as first written, in recipe order", () => {
    expect(assess(["Hoisin sauce", "Fish sauce", "hoisin  sauce", "Whole milk", "Fish Sauce"]).unmatchedNames).toEqual([
      "Hoisin sauce",
      "Fish sauce",
    ]);
  });

  it("treats a match without a reviewed flag as unreviewed", () => {
    const noFlag: IngredientCatalog = { find: () => ({ id: "salt" }) };
    expect(assess(["Salt"], noFlag)).toMatchObject({ contains: [], usesUnreviewedData: true, fullyChecked: false });
  });

  it("adds declared allergens to the catalog's, in ALLERGENS order, without making it checked", () => {
    const result = assessRecipeAllergens(recipeWith("Whole milk", "Hoisin sauce"), SAMPLE, ["sesame", "peanuts"]);
    expect(result).toMatchObject({ contains: ["peanuts", "milk", "sesame"], fullyChecked: false });
  });

  it("a recipe with no ingredients isn't fully checked", () => {
    expect(assessRecipeAllergens({ ingredients: [] }, SAMPLE)).toEqual({
      contains: [],
      unmatchedNames: [],
      usesUnreviewedData: false,
      fullyChecked: false,
    });
  });
});
