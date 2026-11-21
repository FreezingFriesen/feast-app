import type { IngredientCatalog } from "@/repositories/IngredientCatalog";
import { buildIngredientCatalog } from "@/repositories/ingredientCatalogIndex";
import type { Recipe } from "@/repositories/RecipeRepository";
import { SAMPLE_INGREDIENTS } from "@/services/ingredients/sampleIngredients";
import { makeRecipe } from "@/testing/recipeFixtures";
import { assessRecipeAllergens } from "../allergenAssessment";
import { createAssessmentMemo } from "../assessmentMemo";

// The sample catalog, counting how many rows it's asked about.
function countingCatalog() {
  const catalog = buildIngredientCatalog(SAMPLE_INGREDIENTS);
  const counter = { finds: 0 };
  const counted: IngredientCatalog = {
    find(row) {
      counter.finds += 1;
      return catalog.find(row);
    },
  };
  return { catalog: counted, counter };
}

const pancakes = makeRecipe("pancakes", { updatedAt: 1 }, ["Whole milk", "Eggs", "Flour"]);
const stirFry = makeRecipe("stir_fry", { updatedAt: 1 }, ["Soy sauce", "Hoisin sauce"]);

describe("createAssessmentMemo", () => {
  it("assesses each recipe once, then reuses it while nothing changes (e.g. a filter chip)", () => {
    const { catalog, counter } = countingCatalog();
    const memo = createAssessmentMemo();
    const assess = memo.forCatalog(catalog, [pancakes, stirFry]);
    expect(counter.finds).toBe(5);
    expect(assess(pancakes)).toEqual(assessRecipeAllergens(pancakes, buildIngredientCatalog(SAMPLE_INGREDIENTS)));

    const again = memo.forCatalog(catalog, [pancakes, stirFry]);
    again(pancakes);
    again(stirFry);
    expect(counter.finds).toBe(5);
  });

  it("re-assesses only a recipe that was edited", () => {
    const { catalog, counter } = countingCatalog();
    const memo = createAssessmentMemo();
    memo.forCatalog(catalog, [pancakes, stirFry]);
    const edited = { ...stirFry, updatedAt: 2, ingredients: [...stirFry.ingredients, { name: "Butter", quantity: 1, unit: "tbsp" as const }] };
    const assess = memo.forCatalog(catalog, [pancakes, edited]);
    expect(counter.finds).toBe(5 + 3);
    expect(assess(edited).contains).toEqual(["milk", "soy", "wheat"]);
  });

  it("re-assesses everything when the catalog changes", () => {
    const first = countingCatalog();
    const second = countingCatalog();
    const memo = createAssessmentMemo();
    memo.forCatalog(first.catalog, [pancakes, stirFry]);
    memo.forCatalog(second.catalog, [pancakes, stirFry]);
    expect(first.counter.finds).toBe(5);
    expect(second.counter.finds).toBe(5);
  });

  it("forgets recipes that are gone, so memory doesn't grow", () => {
    const assess = jest.fn((recipe: Recipe, catalog: IngredientCatalog) => assessRecipeAllergens(recipe, catalog));
    const { catalog } = countingCatalog();
    const memo = createAssessmentMemo(assess);
    memo.forCatalog(catalog, [pancakes, stirFry]);
    memo.forCatalog(catalog, [pancakes]);
    memo.forCatalog(catalog, [pancakes, stirFry]);
    expect(assess.mock.calls.map(([recipe]) => recipe.id)).toEqual(["pancakes", "stir_fry", "stir_fry"]);
  });

  it("assesses a recipe it wasn't given on the spot, never with a stale result", () => {
    const { catalog } = countingCatalog();
    const memo = createAssessmentMemo();
    const assess = memo.forCatalog(catalog, [pancakes]);
    expect(assess(stirFry).contains).toEqual(["soy", "wheat"]);
  });
});
