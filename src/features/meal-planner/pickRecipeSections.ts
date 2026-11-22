// The meal planner's recipe picker (N-05, and the profile filter from #10, N-04): which
// sections it shows and what a screen reader says for each recipe. Pure, so it's tested
// without rendering.
import { formatOptionLabel } from "@/components/form/formatOptionLabel";
import type { Recipe } from "@/repositories/RecipeRepository";
import type { PlannerMealType } from "@/validation/mealPlanSchema";

type PickableRow = { recipe: Pick<Recipe, "title" | "mealTypes">; notes: readonly { text: string }[] };

export type PickSection<Row> = { title: string; data: Row[] };

// Recipes tagged with the slot's meal type first, then the rest, each in the order given.
// A section with nothing in it is left out, so no empty heading is shown. The rows are
// the ones the allergy & diet filter left, so a hidden recipe is in neither section.
export function pickRecipeSections<Row extends PickableRow>(rows: readonly Row[], mealType: PlannerMealType): PickSection<Row>[] {
  const label = formatOptionLabel(mealType);
  const tagged = rows.filter((row) => row.recipe.mealTypes.includes(mealType));
  const others = rows.filter((row) => !row.recipe.mealTypes.includes(mealType));
  return [
    { title: `Tagged ${label}`, data: tagged },
    { title: tagged.length > 0 ? "Other recipes" : "All recipes", data: others },
  ].filter((section) => section.data.length > 0);
}

// The whole row is one button, so its label carries the allergen and diet notes too
// ("Add Latte. Contains: Milk"): a screen reader user must hear a warning before choosing.
export function pickRowAccessibilityLabel(row: PickableRow): string {
  return [`Add ${row.recipe.title}`, ...row.notes.map((note) => note.text)].join(". ");
}
