import type { IngredientCatalog } from "@/repositories/IngredientCatalog";
import { buildIngredientCatalog } from "@/repositories/ingredientCatalogIndex";
import { manyIngredients } from "@/testing/ingredientFixtures";
import { makeRecipe } from "@/testing/recipeFixtures";
import { DEFAULT_RECIPE_FILTER, type RecipeFilter } from "@/validation/recipeFilterSchema";
import { createAssessmentMemo } from "../assessmentMemo";
import { deriveRecipeListState } from "../recipeListState";

// The budget is generous on purpose (Jest on a laptop or CI). The median on a real phone
// (5 runs, `npx expo start --no-dev --minify`) is for the test team to measure.
const BUDGET_MS = 300;

// 2,000 ingredients, every tenth listing milk and every seventh reviewed.
const ingredients = manyIngredients(2000).map((ingredient, n) => ({
  ...ingredient,
  allergens: n % 10 === 0 ? (["milk"] as const).slice() : [],
  allergensReviewed: n % 7 === 0,
}));

// 1,000 recipes with 50 rows each. About one row in six names an ingredient the catalog
// doesn't have ("Ingredient 2000" and up), so "couldn't check" notes are worked out too.
const recipes = Array.from({ length: 1000 }, (_, r) =>
  makeRecipe(
    `recipe_${String(r).padStart(4, "0")}`,
    {
      title: `Recipe ${(r * 7919) % 1000}`,
      updatedAt: Date.UTC(2026, 9, 1) + r,
      prepTimeMinutes: r % 9 === 0 ? undefined : r % 90,
      dietTags: r % 4 === 0 ? ["vegetarian"] : [],
      mealTypes: r % 3 === 0 ? ["dinner"] : ["lunch"],
    },
    Array.from({ length: 50 }, (_, i) => `Ingredient ${(r * 13 + i * 31) % 2400}`),
  ),
);

function deriveWith(catalogToUse: IngredientCatalog, memo: ReturnType<typeof createAssessmentMemo>, filters: RecipeFilter) {
  return deriveRecipeListState({
    recipesLoaded: true,
    recipes,
    profile: { status: "ready", restrictions: { allergens: ["milk"], diets: [] } },
    profileFilterOn: true,
    filters,
    catalogStatus: "ready",
    assess: memo.forCatalog(catalogToUse, recipes),
  });
}

// One timed first pass: a new catalog snapshot (as after a download, so every match is
// checked again) and a new memo, then assess, filter and sort every recipe.
function timedFirstPass() {
  const snapshot = buildIngredientCatalog(ingredients);
  const counter = { finds: 0 };
  const counted: IngredientCatalog = {
    find(row) {
      counter.finds += 1;
      return snapshot.find(row);
    },
  };
  const memo = createAssessmentMemo();
  const started = performance.now();
  const state = deriveWith(counted, memo, { ...DEFAULT_RECIPE_FILTER, excludeAllergens: ["eggs"], sort: "title" });
  return { elapsed: performance.now() - started, state, counted, counter, memo };
}

describe("recipe filter performance (#10)", () => {
  it(`assesses, filters and sorts 1,000 recipes × 50 rows in under ${BUDGET_MS} ms, and a chip change looks up nothing again`, () => {
    // The best of 3 runs, so a busy machine (Jest runs test files in parallel) or the first
    // run warming up the JavaScript engine doesn't decide the result. Each run still does
    // all the work: every catalog match checked, every recipe assessed.
    const runs = [timedFirstPass(), timedFirstPass(), timedFirstPass()];
    for (const run of runs) {
      expect(run.state.kind).toBe("ready");
      expect(run.counter.finds).toBe(1000 * 50);
    }
    expect(Math.min(...runs.map((run) => run.elapsed))).toBeLessThan(BUDGET_MS);

    // Changing a chip (and the sort) reuses every assessment.
    const last = runs[runs.length - 1];
    const second = deriveWith(last.counted, last.memo, {
      ...DEFAULT_RECIPE_FILTER,
      diets: ["vegetarian"],
      mealTypes: ["dinner"],
      sort: "quickest",
    });
    expect(second.kind).toBe("ready");
    expect(last.counter.finds).toBe(1000 * 50);
  });
});
