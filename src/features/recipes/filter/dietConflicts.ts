// Diet tags the catalog can contradict (#10). A recipe's diet tags are the author's own
// confirmations; this table only catches a tag that a matched ingredient's allergens prove
// wrong, e.g. "vegan" pancakes made with whole milk. It never adds or guesses a tag, and
// ingredient diet tags are never used (they don't stack, and a missing tag means
// "not confirmed").
//
// Typed as a Record over every diet, so a new diet fails typecheck until it's added here.
import type { Allergen, DietTag } from "@/repositories/IngredientCatalog";

// A frozen list of allergens.
const allergenList = (...values: Allergen[]): readonly Allergen[] => Object.freeze(values);

export const DIET_CONFLICTS: Readonly<Record<DietTag, readonly Allergen[]>> = Object.freeze({
  vegan: allergenList("milk", "eggs", "fish", "shellfish"),
  vegetarian: allergenList("fish", "shellfish"),
  pescatarian: allergenList(),
  keto_friendly: allergenList(),
  gluten_free: allergenList("wheat"),
  dairy_free: allergenList("milk"),
});

// One diet tag the recipe's allergens contradict, and which allergens do it.
export type DietConflict = { diet: DietTag; allergens: Allergen[] };

// The recipe's diet tags that its allergens contradict, in the recipe's tag order. Each
// conflict's allergens keep the order of `contains` (ALLERGENS order).
export function conflictingDiets(dietTags: readonly DietTag[], contains: readonly Allergen[]): DietConflict[] {
  const conflicts: DietConflict[] = [];
  for (const diet of dietTags) {
    const ruledOut = DIET_CONFLICTS[diet] ?? [];
    const allergens = contains.filter((allergen) => ruledOut.includes(allergen));
    if (allergens.length > 0) conflicts.push({ diet, allergens });
  }
  return conflicts;
}
