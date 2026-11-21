import { emptyIngredientCatalog, type Allergen, type DietTag, type IngredientCatalog } from "@/repositories/IngredientCatalog";
import type { IngredientCatalogStatus } from "@/repositories/IngredientCatalogStore";
import { buildIngredientCatalog } from "@/repositories/ingredientCatalogIndex";
import type { Recipe } from "@/repositories/RecipeRepository";
import { makeIngredient } from "@/testing/ingredientFixtures";
import { makeRecipe } from "@/testing/recipeFixtures";
import { DEFAULT_RECIPE_FILTER, type RecipeFilter } from "@/validation/recipeFilterSchema";
import { assessRecipeAllergens } from "../allergenAssessment";
import { clearAdHocFilters, profileFilterKey, profileFilterOnFor, type ProfileFilterSource } from "../recipeFilter";
import {
  activeFilterCount,
  CATALOG_EMPTY_NOTICE,
  conflictText,
  containsText,
  deriveRecipeListState,
  FILTER_OFF_MESSAGE,
  filtersLabel,
  hiddenByProfileMessage,
  PROFILE_UNAVAILABLE_MESSAGE,
  profileRowFor,
  uncheckedText,
  UNREVIEWED_NOTICE,
  type RecipeListInput,
  type RecipeListState,
} from "../recipeListState";

const CATALOG = buildIngredientCatalog([
  makeIngredient("milk_whole", "Whole milk", { allergens: ["milk"] }),
  makeIngredient("salt", "Salt", { allergensReviewed: true }),
  makeIngredient("rice", "Rice"),
]);

const ready = (allergens: Allergen[] = [], diets: DietTag[] = []): ProfileFilterSource => ({
  status: "ready",
  restrictions: { allergens, diets },
});
const MILK_ALLERGY = ready(["milk"]);

const LATTE = makeRecipe("latte", { title: "Latte", updatedAt: 3 }, ["Whole milk"]);
const SALTY = makeRecipe("salty", { title: "Salty", updatedAt: 2 }, ["Salt"]);
const RICE = makeRecipe("rice", { title: "Rice bowl", updatedAt: 1 }, ["Rice", "Hoisin sauce"]);

function derive(
  patch: Partial<Omit<RecipeListInput, "assess">> & { catalog?: IngredientCatalog } = {},
): RecipeListState {
  const { catalog = CATALOG, ...rest } = patch;
  return deriveRecipeListState({
    recipesLoaded: true,
    recipes: [LATTE, SALTY, RICE],
    profile: MILK_ALLERGY,
    profileFilterOn: true,
    filters: DEFAULT_RECIPE_FILTER,
    catalogStatus: "ready",
    assess: (recipe: Recipe) => assessRecipeAllergens(recipe, catalog),
    ...rest,
  });
}

// The ready state, failing the test if it's still loading.
function readyState(state: RecipeListState) {
  if (state.kind !== "ready") throw new Error("still loading");
  return state;
}
const rowIds = (state: RecipeListState) => readyState(state).rows.map((row) => row.recipe.id);

describe("deriveRecipeListState: waiting", () => {
  it.each<[string, Partial<RecipeListInput>]>([
    ["the recipes haven't loaded", { recipesLoaded: false }],
    ["the profile is loading", { profile: { status: "loading" } }],
    ["the ingredient catalog is still being read", { catalogStatus: "loading" }],
  ])("shows a spinner while %s, never an unfiltered list", (_label, patch) => {
    expect(derive(patch)).toEqual({ kind: "loading" });
  });
});

describe("deriveRecipeListState: the profile filter (N-04)", () => {
  it("starts on at every app start: recipes with the user's allergens are hidden and counted", () => {
    const profileFilterOn = profileFilterOnFor(null, profileFilterKey("user1", { allergens: ["milk"], diets: [] }));
    const state = readyState(derive({ profileFilterOn }));
    expect(state.profileRow).toEqual({ kind: "filter", on: true, text: "Using your allergies & diets: Milk" });
    expect(rowIds(state)).toEqual(["salty", "rice"]);
    expect(state.hiddenMessage).toBe("1 recipe hidden by your allergies & diets");
    expect(state.offIndicator).toBeNull();
  });

  it("'Show them' turns it off: the recipes come back marked, and the screen says the filter is off", () => {
    const state = readyState(derive({ profileFilterOn: false }));
    expect(state.profileRow).toEqual({ kind: "filter", on: false, text: "Not using your allergies & diets: Milk" });
    expect(state.offIndicator).toBe(FILTER_OFF_MESSAGE);
    expect(state.hiddenMessage).toBeNull();
    expect(rowIds(state)).toEqual(["latte", "salty", "rice"]);
    expect(state.rows[0].notes).toEqual([{ kind: "contains", text: "Contains: Milk" }]);
  });

  it("an unavailable profile shows the error, and the list isn't filtered by it", () => {
    const state = readyState(derive({ profile: { status: "unavailable" } }));
    expect(state.profileError).toBe(PROFILE_UNAVAILABLE_MESSAGE);
    expect(state.profileRow).toEqual({ kind: "unavailable" });
    expect(rowIds(state)).toEqual(["latte", "salty", "rice"]);
    expect(state.rows.flatMap((row) => row.notes)).toEqual([]);
  });

  it.each<[string, ProfileFilterSource, string]>([
    ["not set yet", { status: "ready", restrictions: null }, "not_set"],
    ["set to none", ready(), "none"],
    ["signed out", { status: "signed_out" }, "signed_out"],
    ["waiting for a username", { status: "needs_username" }, "needs_username"],
  ])("with the profile %s, offers the next step and filters nothing", (_label, profile, kind) => {
    const state = readyState(derive({ profile }));
    expect(state.profileRow).toEqual({ kind });
    expect(state.offIndicator).toBeNull();
    expect(state.hiddenMessage).toBeNull();
    expect(rowIds(state)).toEqual(["latte", "salty", "rice"]);
  });

  it("'Clear filters' leaves the profile filter as it is", () => {
    const filters: RecipeFilter = { ...DEFAULT_RECIPE_FILTER, excludeAllergens: ["eggs"], hideUnchecked: true };
    const cleared = clearAdHocFilters(filters);
    const state = readyState(derive({ filters: cleared, profileFilterOn: true }));
    expect(state.activeFilterCount).toBe(0);
    expect(state.profileRow).toMatchObject({ kind: "filter", on: true });
    expect(state.hiddenByProfile).toBe(1);
  });
});

describe("deriveRecipeListState: the allergen data notice", () => {
  it("says the ingredient data hasn't downloaded when the catalog is empty", () => {
    const state = readyState(derive({ catalogStatus: "empty", catalog: emptyIngredientCatalog }));
    expect(state.dataNotice).toBe(CATALOG_EMPTY_NOTICE);
    // With nothing to match against, the milk recipe is shown, marked as unchecked.
    expect(state.rows.find((row) => row.recipe.id === "latte")?.notes).toEqual([
      { kind: "unchecked", text: "Couldn't check: Whole milk" },
    ]);
  });

  it("says the data hasn't been reviewed when a shown recipe uses unreviewed data", () => {
    expect(readyState(derive()).dataNotice).toBe(UNREVIEWED_NOTICE);
  });

  it("shows no notice when every shown recipe uses reviewed data", () => {
    expect(readyState(derive({ recipes: [LATTE, SALTY] })).dataNotice).toBeNull();
  });

  it("shows no notice while no allergen is left out", () => {
    expect(readyState(derive({ profileFilterOn: false })).dataNotice).toBeNull();
    expect(readyState(derive({ profile: { status: "signed_out" }, catalogStatus: "empty" })).dataNotice).toBeNull();
  });

  it("shows no notice when there are no recipes", () => {
    expect(readyState(derive({ recipes: [], catalogStatus: "empty" })).dataNotice).toBeNull();
  });
});

describe("deriveRecipeListState: rows and empty states", () => {
  it("sorts the shown rows by the chosen sort", () => {
    expect(rowIds(derive({ profileFilterOn: false, filters: { ...DEFAULT_RECIPE_FILTER, sort: "title" } }))).toEqual([
      "latte",
      "rice",
      "salty",
    ]);
    expect(rowIds(derive({ profileFilterOn: false }))).toEqual(["latte", "salty", "rice"]);
  });

  it("with no recipes at all: 'No recipes yet', without the filter header", () => {
    const state = readyState(derive({ recipes: [] }));
    expect(state.empty).toEqual({ kind: "no_recipes" });
    expect(state.showHeader).toBe(false);
  });

  it("when only the profile hides everything: offers to turn it off", () => {
    const state = readyState(derive({ recipes: [LATTE] }));
    expect(state.empty).toEqual({ kind: "no_matches", canClearFilters: false, canTurnOffProfile: true });
    expect(state.showHeader).toBe(true);
  });

  it("when only ad-hoc filters hide everything: offers to clear them", () => {
    const filters: RecipeFilter = { ...DEFAULT_RECIPE_FILTER, mealTypes: ["snack"] };
    expect(readyState(derive({ filters, profile: { status: "signed_out" } })).empty).toEqual({
      kind: "no_matches",
      canClearFilters: true,
      canTurnOffProfile: false,
    });
  });

  it("when both hide recipes: offers both", () => {
    const filters: RecipeFilter = { ...DEFAULT_RECIPE_FILTER, mealTypes: ["snack"] };
    const state = readyState(derive({ filters }));
    expect(state).toMatchObject({ hiddenByProfile: 1, hiddenByFilters: 2 });
    expect(readyState(derive({ filters, recipes: [LATTE, SALTY] })).empty).toEqual({
      kind: "no_matches",
      canClearFilters: true,
      canTurnOffProfile: true,
    });
  });

  it("never calls anything safe, allergen-free or OK", () => {
    const states: IngredientCatalogStatus[] = ["empty", "ready"];
    const texts: string[] = [];
    for (const catalogStatus of states) {
      for (const profileFilterOn of [true, false]) {
        const state = readyState(
          derive({
            catalogStatus,
            catalog: catalogStatus === "empty" ? emptyIngredientCatalog : CATALOG,
            profileFilterOn,
            filters: { ...DEFAULT_RECIPE_FILTER, excludeAllergens: ["eggs"] },
          }),
        );
        texts.push(
          ...[state.profileError, state.offIndicator, state.hiddenMessage, state.dataNotice].filter((text) => text !== null),
          ...state.rows.flatMap((row) => row.notes.map((note) => note.text)),
          ...(state.profileRow.kind === "filter" ? [state.profileRow.text] : []),
        );
      }
    }
    expect(texts.length).toBeGreaterThan(5);
    for (const text of texts) expect(text).not.toMatch(/safe|allergen[- ]free|\bok\b|free of/i);
  });
});

describe("text helpers", () => {
  it("counts hidden recipes", () => {
    expect(hiddenByProfileMessage(0)).toBeNull();
    expect(hiddenByProfileMessage(1)).toBe("1 recipe hidden by your allergies & diets");
    expect(hiddenByProfileMessage(3)).toBe("3 recipes hidden by your allergies & diets");
  });

  it("names at most 3 unchecked ingredients", () => {
    expect(uncheckedText(["Flour"])).toBe("Couldn't check: Flour");
    expect(uncheckedText(["Flour", "Hoisin sauce", "Ghee"])).toBe("Couldn't check: Flour, Hoisin sauce, Ghee");
    expect(uncheckedText(["A", "B", "C", "D", "E"])).toBe("Couldn't check: A, B, C and 2 more");
  });

  it("lists contained allergens by their labels", () => {
    expect(containsText(["milk", "tree_nuts"])).toBe("Contains: Milk, Tree nuts");
  });

  it("says which tag is contradicted, and by what", () => {
    expect(conflictText("vegan", ["milk"])).toBe("Tagged Vegan, but contains Milk");
    expect(conflictText("vegan", ["milk", "eggs"])).toBe("Tagged Vegan, but contains Milk and Eggs");
    expect(conflictText("vegan", ["milk", "eggs", "fish"])).toBe("Tagged Vegan, but contains Milk, Eggs and Fish");
    expect(conflictText("gluten_free", ["wheat"])).toBe("Tagged Gluten free, but contains Wheat");
  });

  it("counts the ad-hoc filters that are on, not the sort", () => {
    expect(activeFilterCount(DEFAULT_RECIPE_FILTER)).toBe(0);
    expect(
      activeFilterCount({ diets: ["vegan"], excludeAllergens: ["milk", "eggs"], mealTypes: ["lunch"], hideUnchecked: true }),
    ).toBe(5);
    expect(filtersLabel(0)).toBe("Filters");
    expect(filtersLabel(2)).toBe("Filters (2)");
  });

  it("profileRowFor treats a profile that's still loading as unavailable (the list waits anyway)", () => {
    expect(profileRowFor({ status: "loading" }, true)).toEqual({ kind: "unavailable" });
    expect(profileRowFor(ready(["peanuts", "milk"], ["vegan"]), true)).toEqual({
      kind: "filter",
      on: true,
      text: "Using your allergies & diets: Peanuts, Milk, Vegan",
    });
  });
});
