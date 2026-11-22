// The Recipes tab's list (#10, N-04): the user's recipes, filtered and sorted, with the
// banners and notes to show. Everything works offline from the phone's own data: the
// recipes, the profile copy and the ingredient catalog copy.
//
// The filter state lives in memory only. The profile filter starts on every time the app
// starts, and turning it off lasts only for this user with these restrictions.
import { useAccountProfile } from "@/features/account/useAccountProfile";
import {
  useIngredientCatalog,
  useIngredientCatalogStatus,
} from "@/repositories/RepositoryProvider";
import { DEFAULT_RECIPE_FILTER, recipeFilterSchema, type RecipeFilter } from "@/validation/recipeFilterSchema";
import { useCallback, useMemo, useState } from "react";
import { createAssessmentMemo } from "./filter/assessmentMemo";
import {
  clearAdHocFilters,
  profileFilterKey,
  profileFilterOnFor,
  type ProfileFilterSource,
} from "./filter/recipeFilter";
import { deriveRecipeListState, type RecipeListState } from "./filter/recipeListState";
import { useRecipesState } from "./useRecipes";

export type FilteredRecipes = {
  state: RecipeListState;
  filters: RecipeFilter;
  // Applies new filters if they pass recipeFilterSchema, and returns whether they did. If
  // they don't, the previous filters stay: a partial filter is never applied.
  setFilters: (next: unknown) => boolean;
  profileFilterOn: boolean;
  setProfileFilterOn: (on: boolean) => void;
  // Clears the ad-hoc filters only. Never touches the profile filter.
  clearAdHoc: () => void;
  // Tries loading the profile again, when it was unavailable.
  retryProfile: (() => void) | null;
};

export function useFilteredRecipes(): FilteredRecipes {
  const { recipes, loaded } = useRecipesState();
  const account = useAccountProfile();
  const catalog = useIngredientCatalog();
  const catalogStatus = useIngredientCatalogStatus();

  const [filters, setFilterState] = useState<RecipeFilter>(DEFAULT_RECIPE_FILTER);
  // The user and restrictions the profile filter was turned off for, or null.
  const [offFor, setOffFor] = useState<string | null>(null);
  // One memo for the life of the screen; it starts again when the catalog changes.
  const [memo] = useState(createAssessmentMemo);

  const restrictions = account.status === "ready" ? account.profile.dietaryRestrictions : null;
  const filterKey = account.status === "ready" ? profileFilterKey(account.user.uid, restrictions) : null;
  const profileFilterOn = profileFilterOnFor(offFor, filterKey);

  // Assessments change only with the recipes or the catalog, not with the filters.
  const assess = useMemo(() => memo.forCatalog(catalog, recipes), [memo, catalog, recipes]);

  const status = account.status;
  const state = useMemo(() => {
    const profile: ProfileFilterSource =
      status === "ready" ? { status, restrictions } : { status };
    return deriveRecipeListState({
      recipesLoaded: loaded,
      recipes,
      profile,
      profileFilterOn,
      filters,
      catalogStatus,
      assess,
    });
  }, [status, restrictions, loaded, recipes, profileFilterOn, filters, catalogStatus, assess]);

  const setFilters = useCallback((next: unknown) => {
    const parsed = recipeFilterSchema.safeParse(next);
    if (parsed.success) setFilterState(parsed.data);
    return parsed.success;
  }, []);

  const setProfileFilterOn = useCallback((on: boolean) => setOffFor(on ? null : filterKey), [filterKey]);
  const clearAdHoc = useCallback(() => setFilterState(clearAdHocFilters), []);

  return {
    state,
    filters,
    setFilters,
    profileFilterOn,
    setProfileFilterOn,
    clearAdHoc,
    retryProfile: account.status === "unavailable" ? account.retry : null,
  };
}
