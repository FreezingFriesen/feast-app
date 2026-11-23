// The recipe detail screen (N-01 view, #8 serving scaler), without rendering.
import type { Ingredient } from "@/validation/ingredientSchema";
import type { Recipe } from "@/repositories/RecipeRepository";
import { buildIngredientCatalog } from "@/repositories/ingredientCatalogIndex";
import { makeIngredient } from "@/testing/ingredientFixtures";
import { makeRecipe, row } from "@/testing/recipeFixtures";
import {
  buildRecipeDetailView,
  canStep,
  NO_TIME,
  stepServings,
  type RecipeDetailInput,
  type RecipeDetailView,
} from "../detail/recipeDetailView";
import { assessRecipeAllergens } from "../filter/allergenAssessment";
import type { ProfileFilterSource } from "../filter/recipeFilter";
import { CATALOG_EMPTY_NOTICE, UNREVIEWED_NOTICE } from "../filter/recipeListState";

const CATALOG: Ingredient[] = [
  makeIngredient("whole_milk", "Whole milk", { allergens: ["milk"] }),
  makeIngredient("egg", "Egg", { allergens: ["eggs"] }),
  makeIngredient("water", "Water"),
];
const catalog = buildIngredientCatalog(CATALOG);

const PANCAKES = makeRecipe("pancakes", {
  title: "Pancakes",
  servings: 4,
  prepTimeMinutes: 5,
  cookTimeMinutes: 10,
  mealTypes: ["breakfast", "lunch"],
  ingredients: [
    row("Whole milk", { quantity: 250, unit: "ml" }),
    row("Egg", { quantity: 2, unit: "piece", note: "beaten" }),
    row("Hoisin sauce", { quantity: 1, unit: "tbsp" }),
  ],
  steps: ["Mix.", "Fry."],
  dietTags: ["vegan"],
  description: "Fluffy.",
  notes: "Serve warm.",
});

const restrictions = (allergens: string[] = [], diets: string[] = []): ProfileFilterSource =>
  ({ status: "ready", restrictions: { allergens, diets } }) as ProfileFilterSource;

function view(recipe: Recipe = PANCAKES, patch: Partial<RecipeDetailInput> = {}): RecipeDetailView {
  return buildRecipeDetailView({
    recipe,
    displayedServings: recipe.servings,
    assessment: assessRecipeAllergens(recipe, catalog, recipe.allergens),
    profile: restrictions(),
    catalogStatus: "ready",
    ...patch,
  });
}

// Every string the view can put on screen.
function allText(result: RecipeDetailView): string[] {
  return [
    result.title,
    result.subtitle ?? "",
    result.servingsText,
    result.dataNotice ?? "",
    result.description ?? "",
    result.recipeNotes ?? "",
    ...result.stats.flatMap((stat) => [stat.label, stat.value, stat.spoken]),
    ...result.notes.map((note) => note.text),
    ...result.ingredients.flatMap((item) => [item.name, item.amount, item.spokenAmount, item.note ?? ""]),
    ...result.steps,
    ...result.dietTags,
  ];
}

describe("subtitle", () => {
  it("joins the meal types with commas, then the total time", () => {
    expect(view().subtitle).toBe("Breakfast, Lunch / 15 min");
  });

  it("shows only the meal types when there's no time", () => {
    expect(view(makeRecipe("a", { mealTypes: ["dinner"] })).subtitle).toBe("Dinner");
  });

  it("shows only the time when there are no meal types", () => {
    expect(view(makeRecipe("a", { cookTimeMinutes: 90 })).subtitle).toBe("1 h 30 min");
  });

  it("is hidden when there's neither", () => {
    expect(view(makeRecipe("a")).subtitle).toBeNull();
  });
});

describe("stat strip", () => {
  it("shows total time, the ingredient count and the servings", () => {
    expect(view().stats).toEqual([
      { label: "Total time", value: "15 min", spoken: "Total time: 15 min" },
      { label: "Ingredients", value: "3", spoken: "Ingredients: 3" },
      { label: "Servings", value: "4", spoken: "Servings: 4" },
    ]);
  });

  it("shows a dash when there's no time", () => {
    const stats = view(makeRecipe("a")).stats;
    expect(stats[0]).toEqual({ label: "Total time", value: NO_TIME, spoken: "Total time: not set" });
    expect(NO_TIME).toBe("—");
  });

  it("follows the servings the stepper shows", () => {
    expect(view(PANCAKES, { displayedServings: 7 }).stats[2]).toEqual({
      label: "Servings",
      value: "7",
      spoken: "Servings: 7",
    });
    expect(view(PANCAKES, { displayedServings: 1 }).servingsText).toBe("1 serving");
  });
});

describe("serving scaler (#8)", () => {
  it("doubles every amount from 4 to 8 servings", () => {
    expect(view(PANCAKES, { displayedServings: 8 }).ingredients.map((item) => item.amount)).toEqual([
      "500 ml",
      "4 pieces",
      "2 tbsp",
    ]);
  });

  it("scales 4 down to 1", () => {
    expect(view(PANCAKES, { displayedServings: 1 }).ingredients.map((item) => item.amount)).toEqual([
      "62.5 ml",
      "0.5 piece",
      "0.25 tbsp",
    ]);
  });

  it("uses the shared formatter for uneven ratios, and reads amounts out in words", () => {
    const bread = makeRecipe("bread", { servings: 3, ingredients: [row("Yeast", { quantity: 1, unit: "tsp" })] });
    const scaled = view(bread, { displayedServings: 1 }).ingredients[0];
    expect(scaled.amount).toBe("0.33 tsp");
    expect(scaled.spokenAmount).toBe("0.33 teaspoons");
  });

  it("keeps each row's note", () => {
    expect(view().ingredients[1]).toMatchObject({ name: "Egg", note: "beaten" });
    expect(view().ingredients[0].note).toBeNull();
  });

  it("holds at 1 and 100, and the buttons are disabled there", () => {
    expect(stepServings(1, -1)).toBe(1);
    expect(stepServings(100, 1)).toBe(100);
    expect(stepServings(4, 1)).toBe(5);
    expect(stepServings(4, -1)).toBe(3);
    expect(canStep(1, -1)).toBe(false);
    expect(canStep(100, 1)).toBe(false);
    expect(view(PANCAKES, { displayedServings: 1 })).toMatchObject({ canDecrease: false, canIncrease: true });
    expect(view(PANCAKES, { displayedServings: 100 })).toMatchObject({ canDecrease: true, canIncrease: false });
  });

  it("refuses 0 and 101: the view falls back to the recipe's own servings", () => {
    expect(view(PANCAKES, { displayedServings: 0 }).servings).toBe(4);
    expect(view(PANCAKES, { displayedServings: 101 }).servings).toBe(4);
    expect(view(PANCAKES, { displayedServings: 2.5 }).servings).toBe(4);
  });
});

describe("allergen and diet notes", () => {
  it("says which of the user's allergens the recipe contains", () => {
    const notes = view(PANCAKES, { profile: restrictions(["milk"]) }).notes;
    expect(notes).toContainEqual({ kind: "contains", text: "Contains: Milk" });
  });

  it("lists every one of the user's allergens it contains, and none they don't avoid", () => {
    expect(view(PANCAKES, { profile: restrictions(["eggs", "milk", "peanuts"]) }).notes[0]).toEqual({
      kind: "contains",
      text: "Contains: Milk, Eggs",
    });
  });

  it("names the rows it couldn't check, for anyone avoiding an allergen", () => {
    expect(view(PANCAKES, { profile: restrictions(["peanuts"]) }).notes).toContainEqual({
      kind: "unchecked",
      text: "Couldn't check: Hoisin sauce",
    });
  });

  it("flags a diet tag the recipe's allergens contradict", () => {
    expect(view(PANCAKES).notes).toEqual([{ kind: "conflict", text: "Tagged Vegan, but contains Milk and Eggs" }]);
  });

  it("shows no notes for a user with no restrictions and a recipe with no conflict", () => {
    const plain = makeRecipe("water", {}, ["Water", "Hoisin sauce"]);
    expect(view(plain, { profile: restrictions() }).notes).toEqual([]);
    expect(view(plain, { profile: { status: "ready", restrictions: null } }).notes).toEqual([]);
    expect(view(plain, { profile: restrictions() }).dataNotice).toBeNull();
  });

  it("shows no notes while the profile or the ingredient data is still loading", () => {
    expect(view(PANCAKES, { profile: { status: "loading" } })).toMatchObject({ notes: [], dataNotice: null });
    expect(view(PANCAKES, { profile: restrictions(["milk"]), catalogStatus: "loading", assessment: null })).toMatchObject(
      { notes: [], dataNotice: null },
    );
  });

  it("still flags a diet conflict when the profile couldn't be loaded", () => {
    expect(view(PANCAKES, { profile: { status: "unavailable" } }).notes).toEqual([
      { kind: "conflict", text: "Tagged Vegan, but contains Milk and Eggs" },
    ]);
  });

  it("says when the ingredient data behind the notes is incomplete", () => {
    expect(view(PANCAKES, { profile: restrictions(["milk"]) }).dataNotice).toBe(UNREVIEWED_NOTICE);
    const empty = buildIngredientCatalog([]);
    expect(
      view(PANCAKES, {
        profile: restrictions(["milk"]),
        catalogStatus: "empty",
        assessment: assessRecipeAllergens(PANCAKES, empty, PANCAKES.allergens),
      }).dataNotice,
    ).toBe(CATALOG_EMPTY_NOTICE);
  });

  it("counts the allergens the author marked", () => {
    const marked = makeRecipe("marked", { allergens: ["sesame"] }, ["Water"]);
    expect(view(marked, { profile: restrictions(["sesame"]) }).notes[0]).toEqual({
      kind: "contains",
      text: "Contains: Sesame",
    });
  });

  it("never says safe, allergen-free or OK for you, in any state", () => {
    const profiles: ProfileFilterSource[] = [
      restrictions(),
      restrictions(["milk", "eggs", "peanuts"]),
      { status: "ready", restrictions: null },
      { status: "loading" },
      { status: "unavailable" },
    ];
    const recipes = [PANCAKES, makeRecipe("water"), makeRecipe("plain", { dietTags: ["vegan"] }, ["Water"])];
    for (const recipe of recipes) {
      for (const profile of profiles) {
        for (const displayedServings of [1, 4, 100]) {
          for (const text of allText(view(recipe, { profile, displayedServings }))) {
            expect(text).not.toMatch(/safe|allergen[- ]free|ok for you/i);
          }
        }
      }
    }
  });
});

describe("the rest of the recipe", () => {
  it("shows the description, steps in order, diet tags and notes", () => {
    expect(view()).toMatchObject({
      title: "Pancakes",
      description: "Fluffy.",
      steps: ["Mix.", "Fry."],
      dietTags: ["Vegan"],
      recipeNotes: "Serve warm.",
    });
  });

  it("leaves out an empty description and notes", () => {
    expect(view(makeRecipe("a", { description: "", notes: "" }))).toMatchObject({
      description: null,
      recipeNotes: null,
    });
  });

  it("keeps rows with the same name apart", () => {
    const twice = makeRecipe("twice", {}, ["Salt", "Salt"]);
    const keys = view(twice).ingredients.map((item) => item.key);
    expect(new Set(keys).size).toBe(2);
  });
});
