// Which recipes the Recipes tab shows (#10, N-04, the diet/allergy/meal part of N-03).
// Pure: no React, no storage. View-only: it never changes or hides data anywhere else
// (meal planner, grocery list, sync).
//
// Two sets of criteria:
// - the profile's: the user's saved allergies and diets, applied by default (N-04);
// - the ad-hoc ones picked on screen (recipeFilterSchema).
// A recipe that fails the profile's criteria is counted once, under the profile, even if
// it also fails an ad-hoc one.
import type { AccountProfile } from "@/features/account/useAccountProfile";
import type { Allergen, DietTag } from "@/repositories/IngredientCatalog";
import type { DietaryRestrictions } from "@/repositories/ProfileRepository";
import type { Recipe } from "@/repositories/RecipeRepository";
import type { RecipeFilter } from "@/validation/recipeFilterSchema";
import { ALLERGENS, DIET_TAGS, inVocabularyOrder } from "@/validation/recipeSchema";
import type { AllergenAssessment } from "./allergenAssessment";
import { conflictingDiets, type DietConflict } from "./dietConflicts";

type MealType = Recipe["mealTypes"][number];

// What the filter needs from the account: whether the profile has loaded, and if so the
// saved restrictions (null = not set yet).
export type ProfileFilterSource =
  | { status: "signed_out" | "loading" | "needs_username" | "unavailable" }
  | { status: "ready"; restrictions: DietaryRestrictions | null };

export function toProfileFilterSource(account: AccountProfile): ProfileFilterSource {
  return account.status === "ready"
    ? { status: "ready", restrictions: account.profile.dietaryRestrictions }
    : { status: account.status };
}

// Identifies "this user with these restrictions". Turning the profile filter off applies
// to this key only, so it comes back on when another user signs in or the restrictions
// change. null when there is nothing to turn off.
export function profileFilterKey(uid: string, restrictions: DietaryRestrictions | null): string | null {
  if (restrictions === null) return null;
  return `${uid}|${restrictions.allergens.join(",")}|${restrictions.diets.join(",")}`;
}

// The profile filter is on unless it was turned off for exactly this user and these
// restrictions. `offFor` is the key it was turned off for (null = never turned off, which
// is how every app start begins).
export function profileFilterOnFor(offFor: string | null, key: string | null): boolean {
  return key === null || offFor !== key;
}

export type AdHocFilters = Pick<RecipeFilter, "diets" | "excludeAllergens" | "mealTypes" | "hideUnchecked">;

// What "Clear filters" leaves: no ad-hoc filters, the same sort. The profile filter isn't
// part of RecipeFilter, so clearing can never turn it off or on.
export function clearAdHocFilters(filters: RecipeFilter): RecipeFilter {
  return { diets: [], excludeAllergens: [], mealTypes: [], hideUnchecked: false, sort: filters.sort };
}

export type FilterCriteria = {
  // The profile's restrictions while they're applied, otherwise null.
  profile: { diets: readonly DietTag[]; allergens: readonly Allergen[] } | null;
  adHoc: {
    diets: readonly DietTag[];
    allergens: readonly Allergen[];
    mealTypes: readonly MealType[];
    hideUnchecked: boolean;
  };
  // Allergens named in "Contains:" notes: the user's own (also while the profile filter is
  // off, so they're marked instead of hidden) and the ad-hoc ones.
  warnAllergens: readonly Allergen[];
  // Diets whose conflicts are named ("Tagged Vegan, but contains Milk"): the same idea.
  warnDiets: readonly DietTag[];
  // True while any allergen is being left out, from either set. Rows that couldn't be
  // checked are noted only then.
  excludesAllergens: boolean;
};

const inAllergenOrder = inVocabularyOrder(ALLERGENS);
const inDietOrder = inVocabularyOrder(DIET_TAGS);

// The criteria in force. The profile's restrictions apply when the filter is on and the
// profile is ready with restrictions set; otherwise only the ad-hoc filters do.
export function effectiveCriteria(
  profile: ProfileFilterSource,
  profileFilterOn: boolean,
  adHoc: AdHocFilters,
): FilterCriteria {
  const restrictions = profile.status === "ready" ? profile.restrictions : null;
  const applied =
    restrictions !== null && profileFilterOn
      ? { diets: [...restrictions.diets], allergens: [...restrictions.allergens] }
      : null;
  return {
    profile: applied,
    adHoc: {
      diets: [...adHoc.diets],
      allergens: [...adHoc.excludeAllergens],
      mealTypes: [...adHoc.mealTypes],
      hideUnchecked: adHoc.hideUnchecked,
    },
    warnAllergens: inAllergenOrder([...(restrictions?.allergens ?? []), ...adHoc.excludeAllergens]),
    warnDiets: inDietOrder([...(restrictions?.diets ?? []), ...adHoc.diets]),
    excludesAllergens: (applied?.allergens.length ?? 0) > 0 || adHoc.excludeAllergens.length > 0,
  };
}

// A note shown under a recipe in the list. Structured here; recipeListState turns it into text.
export type RowNote =
  | { kind: "contains"; allergens: Allergen[] }
  | { kind: "conflict"; diet: DietTag; allergens: Allergen[] }
  | { kind: "unchecked"; names: string[] };

export type FilteredRecipe = {
  recipe: Recipe;
  assessment: AllergenAssessment;
  conflicts: DietConflict[];
  notes: RowNote[];
};

export type FilterResult = {
  rows: FilteredRecipe[];
  // Hidden by the profile's restrictions (counted here even if an ad-hoc filter hides them too).
  hiddenByProfile: number;
  // Shown by the profile's criteria but hidden by an ad-hoc filter.
  hiddenByFilters: number;
  // True if a shown recipe's allergens come from unreviewed ingredient data.
  anyUnreviewed: boolean;
};

// Diets are AND: the recipe must be tagged with every one, and none may be contradicted by
// its allergens. An untagged recipe never matches a diet.
function meetsDiets(recipe: Recipe, diets: readonly DietTag[], conflicts: readonly DietConflict[]): boolean {
  return diets.every((diet) => recipe.dietTags.includes(diet) && !conflicts.some((conflict) => conflict.diet === diet));
}

function avoidsAllergens(assessment: AllergenAssessment, allergens: readonly Allergen[]): boolean {
  return !allergens.some((allergen) => assessment.contains.includes(allergen));
}

// Meal types are OR: any one of the chosen types. None chosen means every recipe.
function meetsMealTypes(recipe: Recipe, mealTypes: readonly MealType[]): boolean {
  return mealTypes.length === 0 || mealTypes.some((mealType) => recipe.mealTypes.includes(mealType));
}

function notesFor(assessment: AllergenAssessment, conflicts: readonly DietConflict[], criteria: FilterCriteria): RowNote[] {
  const notes: RowNote[] = [];
  const contains = assessment.contains.filter((allergen) => criteria.warnAllergens.includes(allergen));
  if (contains.length > 0) notes.push({ kind: "contains", allergens: contains });
  for (const conflict of conflicts) {
    if (criteria.warnDiets.includes(conflict.diet)) {
      notes.push({ kind: "conflict", diet: conflict.diet, allergens: [...conflict.allergens] });
    }
  }
  if (criteria.excludesAllergens && assessment.unmatchedNames.length > 0) {
    notes.push({ kind: "unchecked", names: [...assessment.unmatchedNames] });
  }
  return notes;
}

// The recipes to show, in the order given, with their notes, and how many were hidden.
// `assess` gives each recipe's allergen assessment (memoised by the caller).
export function filterRecipes(
  recipes: readonly Recipe[],
  criteria: FilterCriteria,
  assess: (recipe: Recipe) => AllergenAssessment,
): FilterResult {
  const rows: FilteredRecipe[] = [];
  let hiddenByProfile = 0;
  let hiddenByFilters = 0;
  let anyUnreviewed = false;

  for (const recipe of recipes) {
    const assessment = assess(recipe);
    const conflicts = conflictingDiets(recipe.dietTags, assessment.contains);

    const { profile, adHoc } = criteria;
    if (profile !== null && !(meetsDiets(recipe, profile.diets, conflicts) && avoidsAllergens(assessment, profile.allergens))) {
      hiddenByProfile += 1;
      continue;
    }

    // Unchecked rows hide a recipe only when the user asked for that, and only while
    // allergens are being left out. Otherwise the recipe shows with a note.
    const hiddenAsUnchecked = adHoc.hideUnchecked && criteria.excludesAllergens && assessment.unmatchedNames.length > 0;
    if (
      !meetsDiets(recipe, adHoc.diets, conflicts) ||
      !avoidsAllergens(assessment, adHoc.allergens) ||
      !meetsMealTypes(recipe, adHoc.mealTypes) ||
      hiddenAsUnchecked
    ) {
      hiddenByFilters += 1;
      continue;
    }

    if (assessment.usesUnreviewedData) anyUnreviewed = true;
    rows.push({ recipe, assessment, conflicts, notes: notesFor(assessment, conflicts, criteria) });
  }

  return { rows, hiddenByProfile, hiddenByFilters, anyUnreviewed };
}
