import { TextAction } from "@/components/TextAction";
import { filtersLabel } from "@/features/recipes/filter/recipeListState";
import { spacing } from "@/theme";
import type { RecipeFilter } from "@/validation/recipeFilterSchema";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { ProfileFilterBanners, type ReadyRecipeListState } from "./ProfileFilterBanners";
import { RecipeFilterPanel } from "./RecipeFilterPanel";

type RecipeListHeaderProps = {
  state: ReadyRecipeListState;
  filters: RecipeFilter;
  onFiltersChange: (next: RecipeFilter) => void;
  onClearFilters: () => void;
  onProfileFilterChange: (on: boolean) => void;
  onRetryProfile: (() => void) | null;
  panelOpen: boolean;
  onTogglePanel: () => void;
};

// Everything above the Recipes tab's list (#10, N-04): the allergy & diet filter banners,
// then "Filters (n)" and its panel.
export function RecipeListHeader({
  state,
  filters,
  onFiltersChange,
  onClearFilters,
  onProfileFilterChange,
  onRetryProfile,
  panelOpen,
  onTogglePanel,
}: RecipeListHeaderProps) {
  const router = useRouter();
  const label = filtersLabel(state.activeFilterCount);
  return (
    <View style={styles.header}>
      <ProfileFilterBanners
        state={state}
        onProfileFilterChange={onProfileFilterChange}
        onRetryProfile={onRetryProfile}
        links={{
          // withAnchor puts the Account menu under Allergies & Diets, so Back works even
          // when the Account tab hasn't been opened yet.
          openDietary: () => router.navigate("/account/dietary", { withAnchor: true }),
          openAccount: () => router.navigate("/account"),
        }}
      />

      <TextAction
        label={`${label} ${panelOpen ? "▴" : "▾"}`}
        align="start"
        onPress={onTogglePanel}
        accessibilityLabel={`${label}, ${panelOpen ? "open" : "closed"}`}
      />
      {panelOpen ? (
        <RecipeFilterPanel
          filters={filters}
          onChange={onFiltersChange}
          onClear={onClearFilters}
          activeFilterCount={state.activeFilterCount}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.sm,
  },
});
