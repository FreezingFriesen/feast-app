import { FormMessage } from "@/components/form/FormMessage";
import { TextAction } from "@/components/TextAction";
import { filtersLabel, type RecipeListState } from "@/features/recipes/filter/recipeListState";
import { colors, spacing, typography } from "@/theme";
import type { RecipeFilter } from "@/validation/recipeFilterSchema";
import { StyleSheet, Text, View } from "react-native";
import { ProfileFilterRow } from "./ProfileFilterRow";
import { RecipeFilterPanel } from "./RecipeFilterPanel";

type ReadyState = Extract<RecipeListState, { kind: "ready" }>;

type RecipeListHeaderProps = {
  state: ReadyState;
  filters: RecipeFilter;
  onFiltersChange: (next: RecipeFilter) => void;
  onClearFilters: () => void;
  onProfileFilterChange: (on: boolean) => void;
  onRetryProfile: (() => void) | null;
  panelOpen: boolean;
  onTogglePanel: () => void;
};

// Everything above the recipe list (#10, N-04), in this order: the user's own
// restrictions, the "filter is off" indicator, a profile that couldn't load, how many
// recipes the profile hides, the allergen data notice, then Filters. The messages are
// polite live regions, so screen readers hear them change.
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
  const label = filtersLabel(state.activeFilterCount);
  return (
    <View style={styles.header}>
      <ProfileFilterRow row={state.profileRow} onChange={onProfileFilterChange} />

      {state.offIndicator ? (
        <View>
          <FormMessage tone="info" message={state.offIndicator} />
          <TextAction label="Turn on" align="start" onPress={() => onProfileFilterChange(true)} accessibilityLabel="Turn on my allergy and diet filter" />
        </View>
      ) : null}

      {state.profileError ? (
        <View>
          <FormMessage tone="error" message={state.profileError} />
          {onRetryProfile ? <TextAction label="Retry" align="start" onPress={onRetryProfile} /> : null}
        </View>
      ) : null}

      {state.hiddenMessage ? (
        <View style={styles.hidden}>
          <Text style={styles.hiddenText} accessibilityLiveRegion="polite">
            {state.hiddenMessage}
          </Text>
          <TextAction
            label="Show them"
            align="start"
            onPress={() => onProfileFilterChange(false)}
            accessibilityLabel="Show them: turns off my allergy and diet filter"
          />
        </View>
      ) : null}

      {state.dataNotice ? <FormMessage tone="info" message={state.dataNotice} /> : null}

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
  hidden: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: spacing.md,
  },
  hiddenText: {
    ...typography.body,
    color: colors.text,
  },
});
