// The Recipes tab's sort orders (#10). Every order breaks ties by recipe ID, so the list
// never shuffles between renders. Returns a new array; the input is never changed.
import type { Recipe } from "@/repositories/RecipeRepository";
import type { RecipeSort } from "@/validation/recipeFilterSchema";
import { totalMinutes } from "../recipeTime";

// What each sort is called on screen. "Newest" means the most recently edited first.
export const SORT_LABELS: Readonly<Record<RecipeSort, string>> = Object.freeze({
  newest: "Newest",
  title: "A–Z",
  quickest: "Quickest",
});

type SortableRecipe = Pick<Recipe, "id" | "title" | "updatedAt" | "prepTimeMinutes" | "cookTimeMinutes">;

// Titles ignoring case and accents ("Éclair" sorts with "eclair"). One collator for every
// comparison: the same order as localeCompare(b, undefined, { sensitivity: "base" }),
// without building a new collator each time.
const titleCollator = new Intl.Collator(undefined, { sensitivity: "base" });

const byId = (a: SortableRecipe, b: SortableRecipe) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Recipes with no time entered go last.
function byTime(a: SortableRecipe, b: SortableRecipe): number {
  const first = totalMinutes(a);
  const second = totalMinutes(b);
  if (first === second) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  return first - second;
}

const COMPARE: Readonly<Record<RecipeSort, (a: SortableRecipe, b: SortableRecipe) => number>> = Object.freeze({
  newest: (a, b) => b.updatedAt - a.updatedAt,
  title: (a, b) => titleCollator.compare(a.title, b.title),
  quickest: byTime,
});

export function sortRecipes<Row extends { recipe: SortableRecipe }>(rows: readonly Row[], sort: RecipeSort): Row[] {
  const compare = COMPARE[sort] ?? COMPARE.newest;
  return [...rows].sort((a, b) => compare(a.recipe, b.recipe) || byId(a.recipe, b.recipe));
}
