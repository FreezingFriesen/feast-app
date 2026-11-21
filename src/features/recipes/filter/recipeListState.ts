// What the Recipes tab shows (#10, N-04): a spinner, or the list with its banners, notes
// and empty state. Pure, so every state is unit-tested without rendering.
//
// Wording rules (health risk): nothing here ever says "safe", "allergen-free" or "OK for
// you", and no state is shown in green or with a tick. The absence of a warning is the
// only positive signal, and the screen says when the data behind it is incomplete.
import { formatOptionLabel } from "@/components/form/ChipSelect";
import { describeRestrictions } from "@/features/account/dietaryRestrictionsForm";
import type { Allergen, DietTag } from "@/repositories/IngredientCatalog";
import type { IngredientCatalogStatus } from "@/repositories/IngredientCatalogStore";
import type { Recipe } from "@/repositories/RecipeRepository";
import type { RecipeFilter } from "@/validation/recipeFilterSchema";
import type { AllergenAssessment } from "./allergenAssessment";
import {
  effectiveCriteria,
  filterRecipes,
  type AdHocFilters,
  type ProfileFilterSource,
  type RowNote,
} from "./recipeFilter";
import { sortRecipes } from "./recipeSort";

export const PROFILE_UNAVAILABLE_MESSAGE =
  "Couldn't load your allergies & diets, so recipes aren't filtered by them.";
export const FILTER_OFF_MESSAGE =
  "Your allergy & diet filter is off. Recipes with your allergens are marked, not hidden.";
export const CATALOG_EMPTY_NOTICE =
  "Ingredient data hasn't downloaded yet, so allergens can't be checked. Sign in while online, then tap Sync now on the Account page.";
export const UNREVIEWED_NOTICE =
  "Allergens come from ingredient data that hasn't been fully reviewed. Always check labels.";

// "Couldn't check:" names at most this many ingredients, then "and N more".
export const MAX_UNCHECKED_NAMES = 3;

// "Milk", "Milk and Eggs", "Milk, Eggs and Fish".
function joinWithAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function containsText(allergens: readonly Allergen[]): string {
  return `Contains: ${allergens.map(formatOptionLabel).join(", ")}`;
}

export function conflictText(diet: DietTag, allergens: readonly Allergen[]): string {
  return `Tagged ${formatOptionLabel(diet)}, but contains ${joinWithAnd(allergens.map(formatOptionLabel))}`;
}

export function uncheckedText(names: readonly string[]): string {
  const shown = names.slice(0, MAX_UNCHECKED_NAMES).join(", ");
  const rest = names.length - MAX_UNCHECKED_NAMES;
  return rest > 0 ? `Couldn't check: ${shown} and ${rest} more` : `Couldn't check: ${shown}`;
}

export function noteText(note: RowNote): string {
  switch (note.kind) {
    case "contains":
      return containsText(note.allergens);
    case "conflict":
      return conflictText(note.diet, note.allergens);
    case "unchecked":
      return uncheckedText(note.names);
  }
}

// "3 recipes hidden by your allergies & diets", or null when none are.
export function hiddenByProfileMessage(count: number): string | null {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? "recipe" : "recipes"} hidden by your allergies & diets`;
}

// How many ad-hoc filters are on: each chip, plus the "also hide" switch. The sort isn't one.
export function activeFilterCount(filters: AdHocFilters): number {
  return filters.diets.length + filters.excludeAllergens.length + filters.mealTypes.length + (filters.hideUnchecked ? 1 : 0);
}

// "Filters", or "Filters (2)" while two are on.
export function filtersLabel(count: number): string {
  return count > 0 ? `Filters (${count})` : "Filters";
}

// The line about the user's own restrictions at the top of the list.
// - filter: restrictions are set; `text` names them, and the switch shows `on`.
// - none: saved as "I don't have any", so there is nothing to filter by.
// - not_set: never set; the screen links to Allergies & Diets.
// - signed_out / needs_username: the screen says what to do first.
// - unavailable: the profile couldn't be loaded; the error message says so.
export type ProfileRow =
  | { kind: "filter"; on: boolean; text: string }
  | { kind: "none" | "not_set" | "signed_out" | "needs_username" | "unavailable" };

export function profileRowFor(profile: ProfileFilterSource, profileFilterOn: boolean): ProfileRow {
  if (profile.status !== "ready") {
    // loading never reaches the list (it shows a spinner), but has a safe answer anyway.
    return { kind: profile.status === "loading" ? "unavailable" : profile.status };
  }
  const { restrictions } = profile;
  if (restrictions === null) return { kind: "not_set" };
  if (restrictions.allergens.length === 0 && restrictions.diets.length === 0) return { kind: "none" };
  const summary = describeRestrictions(restrictions);
  return profileFilterOn
    ? { kind: "filter", on: true, text: `Using your allergies & diets: ${summary}` }
    : { kind: "filter", on: false, text: `Not using your allergies & diets: ${summary}` };
}

export type RecipeRowView = {
  recipe: Recipe;
  notes: { kind: RowNote["kind"]; text: string }[];
};

export type RecipeListEmpty =
  | { kind: "no_recipes" }
  // Recipes exist but none match. Offer whichever way out applies.
  | { kind: "no_matches"; canClearFilters: boolean; canTurnOffProfile: boolean };

export type RecipeListState =
  | { kind: "loading" }
  | {
      kind: "ready";
      // The banners and filters sit above the list once there is at least one recipe.
      showHeader: boolean;
      profileRow: ProfileRow;
      profileError: string | null;
      offIndicator: string | null;
      hiddenMessage: string | null;
      dataNotice: string | null;
      activeFilterCount: number;
      hiddenByProfile: number;
      hiddenByFilters: number;
      rows: RecipeRowView[];
      empty: RecipeListEmpty | null;
    };

export type RecipeListInput = {
  recipesLoaded: boolean;
  recipes: readonly Recipe[];
  profile: ProfileFilterSource;
  profileFilterOn: boolean;
  filters: RecipeFilter;
  catalogStatus: IngredientCatalogStatus;
  assess: (recipe: Recipe) => AllergenAssessment;
};

export function deriveRecipeListState(input: RecipeListInput): RecipeListState {
  // Never show an unfiltered list as if it were filtered: wait for the recipes, the
  // profile and the first read of the ingredient catalog.
  if (!input.recipesLoaded || input.profile.status === "loading" || input.catalogStatus === "loading") {
    return { kind: "loading" };
  }

  const profileRow = profileRowFor(input.profile, input.profileFilterOn);
  const criteria = effectiveCriteria(input.profile, input.profileFilterOn, input.filters);
  const result = filterRecipes(input.recipes, criteria, input.assess);
  const filterCount = activeFilterCount(input.filters);

  // Only while allergens are being left out, and only when what's shown isn't fully checked.
  let dataNotice: string | null = null;
  if (criteria.excludesAllergens && input.recipes.length > 0) {
    if (input.catalogStatus === "empty") dataNotice = CATALOG_EMPTY_NOTICE;
    else if (result.anyUnreviewed) dataNotice = UNREVIEWED_NOTICE;
  }

  let empty: RecipeListEmpty | null = null;
  if (input.recipes.length === 0) {
    empty = { kind: "no_recipes" };
  } else if (result.rows.length === 0) {
    empty = { kind: "no_matches", canClearFilters: filterCount > 0, canTurnOffProfile: result.hiddenByProfile > 0 };
  }

  return {
    kind: "ready",
    showHeader: input.recipes.length > 0,
    profileRow,
    profileError: input.profile.status === "unavailable" ? PROFILE_UNAVAILABLE_MESSAGE : null,
    offIndicator: profileRow.kind === "filter" && !profileRow.on ? FILTER_OFF_MESSAGE : null,
    hiddenMessage: hiddenByProfileMessage(result.hiddenByProfile),
    dataNotice,
    activeFilterCount: filterCount,
    hiddenByProfile: result.hiddenByProfile,
    hiddenByFilters: result.hiddenByFilters,
    rows: sortRecipes(result.rows, input.filters.sort).map((row) => ({
      recipe: row.recipe,
      notes: row.notes.map((note) => ({ kind: note.kind, text: noteText(note) })),
    })),
    empty,
  };
}
