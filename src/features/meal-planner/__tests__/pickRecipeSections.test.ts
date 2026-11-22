import { assessRecipeAllergens } from "@/features/recipes/filter/allergenAssessment";
import { deriveRecipeListState } from "@/features/recipes/filter/recipeListState";
import { buildIngredientCatalog } from "@/repositories/ingredientCatalogIndex";
import type { Recipe } from "@/repositories/RecipeRepository";
import { makeIngredient } from "@/testing/ingredientFixtures";
import { makeRecipe } from "@/testing/recipeFixtures";
import { DEFAULT_RECIPE_FILTER } from "@/validation/recipeFilterSchema";
import { pickRecipeSections, pickRowAccessibilityLabel } from "../pickRecipeSections";

const rowOf = (recipe: Recipe, notes: string[] = []) => ({ recipe, notes: notes.map((text) => ({ text })) });
const titles = (sections: ReturnType<typeof pickRecipeSections>) =>
  sections.map((section) => `${section.title}: ${section.data.map((row) => row.recipe.title).join(", ")}`);

describe("pickRecipeSections", () => {
  const omelette = makeRecipe("a", { title: "Omelette", mealTypes: ["breakfast"] });
  const soup = makeRecipe("b", { title: "Soup", mealTypes: ["lunch", "dinner"] });
  const toast = makeRecipe("c", { title: "Toast", mealTypes: ["breakfast", "snack"] });
  const untagged = makeRecipe("d", { title: "Rice" });

  it("lists recipes tagged with the slot's meal type first, then the rest, each in the order given", () => {
    const rows = [omelette, soup, toast, untagged].map((recipe) => rowOf(recipe));
    expect(titles(pickRecipeSections(rows, "breakfast"))).toEqual(["Tagged Breakfast: Omelette, Toast", "Other recipes: Soup, Rice"]);
  });

  it("calls the rest 'All recipes' when none are tagged", () => {
    expect(titles(pickRecipeSections([rowOf(soup), rowOf(untagged)], "breakfast"))).toEqual(["All recipes: Soup, Rice"]);
  });

  it("leaves out an empty section", () => {
    expect(titles(pickRecipeSections([rowOf(soup)], "dinner"))).toEqual(["Tagged Dinner: Soup"]);
    expect(pickRecipeSections([], "lunch")).toEqual([]);
  });
});

describe("pickRowAccessibilityLabel", () => {
  it("names the recipe, then every note, so a warning is heard before choosing", () => {
    const latte = makeRecipe("l", { title: "Latte" });
    expect(pickRowAccessibilityLabel(rowOf(latte))).toBe("Add Latte");
    expect(pickRowAccessibilityLabel(rowOf(latte, ["Contains: Milk", "Couldn't check: Foam"]))).toBe(
      "Add Latte. Contains: Milk. Couldn't check: Foam",
    );
  });
});

describe("the picker with the allergy & diet filter (#10, N-04)", () => {
  const catalog = buildIngredientCatalog([makeIngredient("milk_whole", "Whole milk", { allergens: ["milk"] })]);
  const recipes = [
    makeRecipe("latte", { title: "Latte", mealTypes: ["breakfast"] }, ["Whole milk"]),
    makeRecipe("toast", { title: "Toast", mealTypes: ["breakfast"] }, ["Bread"]),
    makeRecipe("soup", { title: "Soup", mealTypes: ["dinner"] }, ["Water"]),
  ];
  const stateFor = (profileFilterOn: boolean) => {
    const state = deriveRecipeListState({
      recipesLoaded: true,
      recipes,
      profile: { status: "ready", restrictions: { allergens: ["milk"], diets: [] } },
      profileFilterOn,
      filters: { ...DEFAULT_RECIPE_FILTER, sort: "title" },
      catalogStatus: "ready",
      assess: (recipe) => assessRecipeAllergens(recipe, catalog, recipe.allergens),
    });
    if (state.kind !== "ready") throw new Error("still loading");
    return state;
  };

  it("a recipe the filter hides is in neither section", () => {
    const state = stateFor(true);
    expect(titles(pickRecipeSections(state.rows, "breakfast"))).toEqual(["Tagged Breakfast: Toast", "Other recipes: Soup"]);
    expect(state.hiddenMessage).toBe("1 recipe hidden by your allergies & diets");
  });

  it("with the filter off it comes back, and its warning is part of what's read out", () => {
    const sections = pickRecipeSections(stateFor(false).rows, "breakfast");
    expect(titles(sections)).toEqual(["Tagged Breakfast: Latte, Toast", "Other recipes: Soup"]);
    expect(pickRowAccessibilityLabel(sections[0].data[0])).toBe("Add Latte. Contains: Milk");
  });
});
