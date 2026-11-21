import type { AccountProfile } from "@/features/account/useAccountProfile";
import { emptyIngredientCatalog, type Allergen, type DietTag, type IngredientCatalog } from "@/repositories/IngredientCatalog";
import { buildIngredientCatalog } from "@/repositories/ingredientCatalogIndex";
import type { Profile } from "@/repositories/ProfileRepository";
import type { Recipe } from "@/repositories/RecipeRepository";
import { makeIngredient } from "@/testing/ingredientFixtures";
import { makeRecipe } from "@/testing/recipeFixtures";
import { DEFAULT_RECIPE_FILTER } from "@/validation/recipeFilterSchema";
import { ALLERGENS, DIET_TAGS } from "@/validation/recipeSchema";
import { assessRecipeAllergens } from "../allergenAssessment";
import { DIET_CONFLICTS } from "../dietConflicts";
import {
  clearAdHocFilters,
  effectiveCriteria,
  filterRecipes,
  profileFilterKey,
  profileFilterOnFor,
  toProfileFilterSource,
  type AdHocFilters,
  type ProfileFilterSource,
} from "../recipeFilter";

// Made-up ingredients. "Food 0" … "Food 10" each contain one allergen, in ALLERGENS order.
const CATALOG = buildIngredientCatalog([
  makeIngredient("milk_whole", "Whole milk", { allergens: ["milk"], allergensReviewed: false }),
  makeIngredient("milk_reviewed", "Reviewed milk", { allergens: ["milk"], allergensReviewed: true }),
  makeIngredient("salt", "Salt", { allergensReviewed: true }),
  makeIngredient("egg", "Egg", { allergens: ["eggs"], allergensReviewed: true }),
  makeIngredient("rice", "Rice", { allergensReviewed: false }),
  ...ALLERGENS.map((allergen, n) =>
    makeIngredient(`food_${n}`, `Food ${n}`, { allergens: [allergen], allergensReviewed: true }),
  ),
]);
const foodWith = (allergen: Allergen) => `Food ${ALLERGENS.indexOf(allergen)}`;

const NO_FILTERS: AdHocFilters = { diets: [], excludeAllergens: [], mealTypes: [], hideUnchecked: false };
const ready = (allergens: Allergen[] = [], diets: DietTag[] = []): ProfileFilterSource => ({
  status: "ready",
  restrictions: { allergens, diets },
});
const MILK_ALLERGY = ready(["milk"]);

function run(
  recipes: Recipe[],
  profile: ProfileFilterSource,
  profileFilterOn: boolean,
  adHoc: Partial<AdHocFilters> = {},
  catalog: IngredientCatalog = CATALOG,
) {
  return filterRecipes(recipes, effectiveCriteria(profile, profileFilterOn, { ...NO_FILTERS, ...adHoc }), (recipe) =>
    assessRecipeAllergens(recipe, catalog),
  );
}
const ids = (result: ReturnType<typeof run>) => result.rows.map((filtered) => filtered.recipe.id);
const notesOf = (result: ReturnType<typeof run>, id: string) =>
  result.rows.find((filtered) => filtered.recipe.id === id)?.notes;

describe("filterRecipes: the decision table (user allergic to milk)", () => {
  it("filter on, a matched row lists milk (unreviewed): hidden, counted under the profile", () => {
    const result = run([makeRecipe("latte", {}, ["Whole milk"])], MILK_ALLERGY, true);
    expect(result).toEqual({ rows: [], hiddenByProfile: 1, hiddenByFilters: 0, anyUnreviewed: false });
  });

  it("filter on, a matched row lists milk (reviewed): hidden, counted under the profile", () => {
    const result = run([makeRecipe("latte", {}, ["Reviewed milk"])], MILK_ALLERGY, true);
    expect(result.hiddenByProfile).toBe(1);
    expect(result.rows).toEqual([]);
  });

  it("filter on, every row matched and reviewed, no milk: shown with no note", () => {
    const result = run([makeRecipe("omelette", {}, ["Salt", "Egg"])], MILK_ALLERGY, true);
    expect(ids(result)).toEqual(["omelette"]);
    expect(notesOf(result, "omelette")).toEqual([]);
    expect(result.anyUnreviewed).toBe(false);
  });

  it("filter on, every row matched, some unreviewed, no milk listed: shown with no note, flagged as unreviewed", () => {
    const result = run([makeRecipe("rice", {}, ["Salt", "Rice"])], MILK_ALLERGY, true);
    expect(ids(result)).toEqual(["rice"]);
    expect(notesOf(result, "rice")).toEqual([]);
    expect(result.anyUnreviewed).toBe(true);
  });

  it("filter on, some rows unmatched, no milk listed: shown with 'couldn't check'", () => {
    const result = run([makeRecipe("stir_fry", {}, ["Salt", "Hoisin sauce"])], MILK_ALLERGY, true);
    expect(notesOf(result, "stir_fry")).toEqual([{ kind: "unchecked", names: ["Hoisin sauce"] }]);
  });

  it("... and hidden instead when 'also hide' is on, counted under the filters", () => {
    const result = run([makeRecipe("stir_fry", {}, ["Salt", "Hoisin sauce"])], MILK_ALLERGY, true, { hideUnchecked: true });
    expect(result).toEqual({ rows: [], hiddenByProfile: 0, hiddenByFilters: 1, anyUnreviewed: false });
  });

  it("filter on, ingredient data never downloaded: shown with 'couldn't check', never as allergen-free", () => {
    const result = run([makeRecipe("latte", {}, ["Whole milk"])], MILK_ALLERGY, true, {}, emptyIngredientCatalog);
    expect(notesOf(result, "latte")).toEqual([{ kind: "unchecked", names: ["Whole milk"] }]);
  });

  it("filter off, a matched row lists milk: shown, marked 'contains milk'", () => {
    const result = run([makeRecipe("latte", {}, ["Whole milk", "Hoisin sauce"])], MILK_ALLERGY, false);
    expect(result.hiddenByProfile).toBe(0);
    expect(notesOf(result, "latte")).toEqual([{ kind: "contains", allergens: ["milk"] }]);
  });

  it("filter off, anything else: shown with no allergen note", () => {
    const recipes = [
      makeRecipe("omelette", {}, ["Salt", "Egg"]),
      makeRecipe("stir_fry", {}, ["Hoisin sauce"]),
      makeRecipe("rice", {}, ["Rice"]),
    ];
    const result = run(recipes, MILK_ALLERGY, false);
    expect(ids(result)).toEqual(["omelette", "stir_fry", "rice"]);
    expect(result.rows.every((filtered) => filtered.notes.length === 0)).toBe(true);
  });

  it("filter off with an ad-hoc allergen left out: unmatched rows get 'couldn't check' again", () => {
    const result = run([makeRecipe("stir_fry", {}, ["Hoisin sauce"])], MILK_ALLERGY, false, { excludeAllergens: ["eggs"] });
    expect(notesOf(result, "stir_fry")).toEqual([{ kind: "unchecked", names: ["Hoisin sauce"] }]);
  });
});

describe("filterRecipes: profile states", () => {
  const latte = makeRecipe("latte", {}, ["Whole milk", "Hoisin sauce"]);

  it.each<[string, ProfileFilterSource]>([
    ["not set yet", { status: "ready", restrictions: null }],
    ["set to none", ready()],
    ["signed out", { status: "signed_out" }],
    ["still loading", { status: "loading" }],
    ["unavailable", { status: "unavailable" }],
    ["waiting for a username", { status: "needs_username" }],
  ])("with the profile %s, nothing is filtered or marked", (_label, profile) => {
    const result = run([latte], profile, true);
    expect(result).toMatchObject({ hiddenByProfile: 0, hiddenByFilters: 0 });
    expect(notesOf(result, "latte")).toEqual([]);
  });
});

describe("filterRecipes: diets", () => {
  const recipes = [
    makeRecipe("vegan", { dietTags: ["vegan"] }, ["Salt"]),
    makeRecipe("both", { dietTags: ["vegan", "gluten_free"] }, ["Salt"]),
    makeRecipe("gluten_free", { dietTags: ["gluten_free"] }, ["Salt"]),
    makeRecipe("untagged", {}, ["Salt"]),
  ];

  it("keeps only recipes tagged with every chosen diet (AND); untagged never match", () => {
    const result = run(recipes, { status: "signed_out" }, true, { diets: ["vegan", "gluten_free"] });
    expect(ids(result)).toEqual(["both"]);
    expect(result.hiddenByFilters).toBe(3);
  });

  it("applies the profile's diets the same way, counted under the profile", () => {
    const result = run(recipes, ready([], ["vegan"]), true);
    expect(ids(result)).toEqual(["vegan", "both"]);
    expect(result).toMatchObject({ hiddenByProfile: 2, hiddenByFilters: 0 });
  });

  it("a recipe whose tag its allergens contradict doesn't match that diet", () => {
    const pancakes = makeRecipe("pancakes", { dietTags: ["vegan"] }, ["Whole milk"]);
    expect(run([pancakes], { status: "signed_out" }, true, { diets: ["vegan"] }).hiddenByFilters).toBe(1);
    expect(run([pancakes], ready([], ["vegan"]), true).hiddenByProfile).toBe(1);
  });

  it.each(DIET_TAGS.flatMap((diet) => DIET_CONFLICTS[diet].map((allergen) => [diet, allergen] as const)))(
    "tagged %s but containing %s: hidden by that diet filter",
    (diet, allergen) => {
      const recipe = makeRecipe("r", { dietTags: [diet] }, [foodWith(allergen)]);
      expect(ids(run([recipe], { status: "signed_out" }, true, { diets: [diet] }))).toEqual([]);
    },
  );

  it("with the profile filter off, a contradicted profile diet is named on the row", () => {
    const pancakes = makeRecipe("pancakes", { dietTags: ["vegan"] }, ["Whole milk"]);
    const result = run([pancakes], ready([], ["vegan"]), false);
    expect(notesOf(result, "pancakes")).toEqual([{ kind: "conflict", diet: "vegan", allergens: ["milk"] }]);
  });

  it("a contradicted diet the user doesn't follow isn't named", () => {
    const pancakes = makeRecipe("pancakes", { dietTags: ["vegan"] }, ["Whole milk"]);
    expect(notesOf(run([pancakes], { status: "signed_out" }, true), "pancakes")).toEqual([]);
    expect(notesOf(run([pancakes], MILK_ALLERGY, false), "pancakes")).toEqual([{ kind: "contains", allergens: ["milk"] }]);
  });
});

describe("filterRecipes: meal types and combinations", () => {
  it("keeps recipes with any chosen meal type (OR)", () => {
    const recipes = [
      makeRecipe("a", { mealTypes: ["breakfast"] }),
      makeRecipe("b", { mealTypes: ["dinner"] }),
      makeRecipe("c", { mealTypes: ["lunch", "dinner"] }),
      makeRecipe("d"),
    ];
    const result = run(recipes, { status: "signed_out" }, true, { mealTypes: ["breakfast", "lunch"] });
    expect(ids(result)).toEqual(["a", "c"]);
    expect(result.hiddenByFilters).toBe(2);
  });

  it("combines the profile with ad-hoc filters, counting a recipe hidden by both once, under the profile", () => {
    const recipes = [
      makeRecipe("milk", {}, ["Whole milk"]),
      makeRecipe("eggs", {}, ["Egg"]),
      makeRecipe("both", {}, ["Whole milk", "Egg"]),
      makeRecipe("salt", {}, ["Salt"]),
    ];
    const result = run(recipes, MILK_ALLERGY, true, { excludeAllergens: ["eggs"] });
    expect(ids(result)).toEqual(["salt"]);
    expect(result).toMatchObject({ hiddenByProfile: 2, hiddenByFilters: 1 });
  });

  it("the same allergen in the profile and the ad-hoc filters counts under the profile", () => {
    const result = run([makeRecipe("latte", {}, ["Whole milk"])], MILK_ALLERGY, true, { excludeAllergens: ["milk"] });
    expect(result).toMatchObject({ hiddenByProfile: 1, hiddenByFilters: 0 });
  });

  it("an ad-hoc allergen still hides recipes while the profile filter is off", () => {
    const result = run([makeRecipe("omelette", {}, ["Egg"])], MILK_ALLERGY, false, { excludeAllergens: ["eggs"] });
    expect(result).toMatchObject({ rows: [], hiddenByProfile: 0, hiddenByFilters: 1 });
  });

  it("'also hide' does nothing while no allergen is left out", () => {
    const result = run([makeRecipe("stir_fry", {}, ["Hoisin sauce"])], { status: "signed_out" }, true, { hideUnchecked: true });
    expect(ids(result)).toEqual(["stir_fry"]);
    expect(notesOf(result, "stir_fry")).toEqual([]);
  });

  it("'unreviewed' only counts recipes that are shown", () => {
    const recipes = [makeRecipe("latte", {}, ["Whole milk"]), makeRecipe("omelette", {}, ["Egg"])];
    expect(run(recipes, MILK_ALLERGY, true).anyUnreviewed).toBe(false);
    expect(run(recipes, MILK_ALLERGY, false).anyUnreviewed).toBe(true);
  });

  it("names only the user's allergens in 'contains', and lists notes in a fixed order", () => {
    const recipe = makeRecipe("cake", { dietTags: ["vegan"] }, ["Whole milk", "Food 0", "Hoisin sauce"]);
    const result = run([recipe], ready(["milk"], ["vegan"]), false, { excludeAllergens: ["sesame"] });
    expect(notesOf(result, "cake")).toEqual([
      { kind: "contains", allergens: ["milk"] },
      { kind: "conflict", diet: "vegan", allergens: ["milk"] },
      { kind: "unchecked", names: ["Hoisin sauce"] },
    ]);
  });

  it("shows everything with no notes when there are no criteria", () => {
    const recipes = [makeRecipe("latte", { dietTags: ["vegan"] }, ["Whole milk", "Hoisin sauce"]), makeRecipe("salt", {}, ["Salt"])];
    const result = run(recipes, { status: "signed_out" }, true);
    expect(ids(result)).toEqual(["latte", "salt"]);
    expect(result.rows.flatMap((filtered) => filtered.notes)).toEqual([]);
  });

  it("keeps the order it was given and changes nothing it was given", () => {
    const recipes = [makeRecipe("b", {}, ["Salt"]), makeRecipe("a", {}, ["Whole milk"]), makeRecipe("c", {}, ["Rice"])];
    const adHoc: AdHocFilters = { diets: [], excludeAllergens: ["eggs"], mealTypes: [], hideUnchecked: false };
    const before = structuredClone({ recipes, adHoc });
    const result = filterRecipes(recipes, effectiveCriteria(MILK_ALLERGY, true, adHoc), (recipe) =>
      assessRecipeAllergens(recipe, CATALOG),
    );
    expect(ids(result as ReturnType<typeof run>)).toEqual(["b", "c"]);
    expect({ recipes, adHoc }).toEqual(before);
  });
});

describe("effectiveCriteria", () => {
  it("applies the profile only while the filter is on", () => {
    expect(effectiveCriteria(MILK_ALLERGY, true, NO_FILTERS).profile).toEqual({ diets: [], allergens: ["milk"] });
    expect(effectiveCriteria(MILK_ALLERGY, false, NO_FILTERS).profile).toBeNull();
  });

  it("still warns about the user's allergens and diets while the filter is off", () => {
    const criteria = effectiveCriteria(ready(["milk"], ["vegan"]), false, { ...NO_FILTERS, excludeAllergens: ["peanuts", "milk"], diets: ["gluten_free"] });
    expect(criteria.warnAllergens).toEqual(["peanuts", "milk"]);
    expect(criteria.warnDiets).toEqual(["vegan", "gluten_free"]);
  });

  it("says allergens are being left out only when some are", () => {
    expect(effectiveCriteria(MILK_ALLERGY, true, NO_FILTERS).excludesAllergens).toBe(true);
    expect(effectiveCriteria(MILK_ALLERGY, false, NO_FILTERS).excludesAllergens).toBe(false);
    expect(effectiveCriteria(ready([], ["vegan"]), true, NO_FILTERS).excludesAllergens).toBe(false);
    expect(effectiveCriteria({ status: "signed_out" }, true, { ...NO_FILTERS, excludeAllergens: ["soy"] }).excludesAllergens).toBe(true);
  });
});

describe("the profile filter's on/off state", () => {
  it("is on until it's turned off for this user and these restrictions", () => {
    const key = profileFilterKey("user1", { allergens: ["milk"], diets: [] });
    expect(profileFilterOnFor(null, key)).toBe(true);
    expect(profileFilterOnFor(key, key)).toBe(false);
  });

  it("comes back on for another user, or when the restrictions change", () => {
    const off = profileFilterKey("user1", { allergens: ["milk"], diets: [] });
    expect(profileFilterOnFor(off, profileFilterKey("user2", { allergens: ["milk"], diets: [] }))).toBe(true);
    expect(profileFilterOnFor(off, profileFilterKey("user1", { allergens: ["milk", "eggs"], diets: [] }))).toBe(true);
    expect(profileFilterOnFor(off, profileFilterKey("user1", { allergens: ["milk"], diets: ["vegan"] }))).toBe(true);
  });

  it("has nothing to turn off without restrictions", () => {
    expect(profileFilterKey("user1", null)).toBeNull();
    expect(profileFilterOnFor("anything", null)).toBe(true);
  });
});

describe("clearAdHocFilters", () => {
  it("clears every ad-hoc filter and keeps the sort", () => {
    const filters = { diets: ["vegan" as const], excludeAllergens: ["milk" as const], mealTypes: ["lunch" as const], hideUnchecked: true, sort: "title" as const };
    expect(clearAdHocFilters(filters)).toEqual({ ...DEFAULT_RECIPE_FILTER, sort: "title" });
  });
});

describe("toProfileFilterSource", () => {
  const user = { uid: "user1", email: null, emailVerified: false };
  const profile: Profile = {
    uid: "user1",
    username: "levi",
    dietaryRestrictions: { allergens: ["milk"], diets: [] },
    createdAt: 1,
    updatedAt: 1,
    schemaVersion: 1,
  };

  it.each<[AccountProfile, ProfileFilterSource]>([
    [{ status: "signed_out" }, { status: "signed_out" }],
    [{ status: "loading", user }, { status: "loading" }],
    [{ status: "needs_username", user }, { status: "needs_username" }],
    [{ status: "unavailable", user, retry: () => {} }, { status: "unavailable" }],
    [{ status: "ready", user, profile }, { status: "ready", restrictions: { allergens: ["milk"], diets: [] } }],
  ])("%p", (account, expected) => {
    expect(toProfileFilterSource(account)).toEqual(expected);
  });
});
