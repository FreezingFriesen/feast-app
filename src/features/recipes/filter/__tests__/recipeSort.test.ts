import type { Recipe } from "@/repositories/RecipeRepository";
import { makeRecipe } from "@/testing/recipeFixtures";
import type { RecipeSort } from "@/validation/recipeFilterSchema";
import { SORT_LABELS, sortRecipes } from "../recipeSort";

const rowsOf = (recipes: Recipe[]) => recipes.map((recipe) => ({ recipe }));
const order = (recipes: Recipe[], sort: RecipeSort) => sortRecipes(rowsOf(recipes), sort).map((row) => row.recipe.id);

describe("sortRecipes", () => {
  it("newest: most recently edited first", () => {
    const recipes = [
      makeRecipe("old", { updatedAt: 100 }),
      makeRecipe("new", { updatedAt: 300 }),
      makeRecipe("mid", { updatedAt: 200 }),
    ];
    expect(order(recipes, "newest")).toEqual(["new", "mid", "old"]);
  });

  it("title: A–Z ignoring case and accents", () => {
    const recipes = [
      makeRecipe("g2", { title: "grandma's jalapeno mac & cheese" }),
      makeRecipe("b", { title: "banana bread" }),
      makeRecipe("e2", { title: "eclair" }),
      makeRecipe("g1", { title: "Grandma's Jalapeño Mac & Cheese" }),
      makeRecipe("e1", { title: "Éclair" }),
      makeRecipe("a", { title: "Apple pie" }),
      makeRecipe("z", { title: "zucchini fritters" }),
    ];
    // Titles that differ only by case or accent tie, and the ID decides.
    expect(order(recipes, "title")).toEqual(["a", "b", "e1", "e2", "g1", "g2", "z"]);
  });

  it("quickest: shortest prep + cook time first, recipes with no time last", () => {
    const recipes = [
      makeRecipe("none"),
      makeRecipe("slow", { prepTimeMinutes: 30, cookTimeMinutes: 60 }),
      makeRecipe("cook_only", { cookTimeMinutes: 20 }),
      makeRecipe("prep_only", { prepTimeMinutes: 5 }),
      makeRecipe("zero", { prepTimeMinutes: 0 }),
      makeRecipe("also_none"),
    ];
    expect(order(recipes, "quickest")).toEqual(["zero", "prep_only", "cook_only", "slow", "also_none", "none"]);
  });

  it.each<RecipeSort>(["newest", "title", "quickest"])("%s: ties are broken by ID", (sort) => {
    const same = { title: "Soup", updatedAt: 100, prepTimeMinutes: 10 };
    const recipes = [makeRecipe("c", same), makeRecipe("a", same), makeRecipe("b", same)];
    expect(order(recipes, sort)).toEqual(["a", "b", "c"]);
  });

  it("returns a new array and leaves the input alone", () => {
    const rows = rowsOf([makeRecipe("b", { updatedAt: 1 }), makeRecipe("a", { updatedAt: 2 })]);
    const sorted = sortRecipes(rows, "newest");
    expect(sorted).not.toBe(rows);
    expect(rows.map((row) => row.recipe.id)).toEqual(["b", "a"]);
  });

  it("gives the same order every time", () => {
    const recipes = [makeRecipe("x", { title: "Éclair" }), makeRecipe("y", { title: "eclair" }), makeRecipe("w", { title: "Apple" })];
    const first = sortRecipes(rowsOf(recipes), "title");
    expect(sortRecipes(first, "title")).toEqual(first);
    expect(sortRecipes(rowsOf([...recipes].reverse()), "title").map((row) => row.recipe.id)).toEqual(
      first.map((row) => row.recipe.id),
    );
  });

  it("falls back to newest for a sort it doesn't know", () => {
    const recipes = [makeRecipe("old", { updatedAt: 1 }), makeRecipe("new", { updatedAt: 2 })];
    expect(order(recipes, "random" as RecipeSort)).toEqual(["new", "old"]);
  });

  it("labels each sort", () => {
    expect(SORT_LABELS).toEqual({ newest: "Newest", title: "A–Z", quickest: "Quickest" });
  });
});
