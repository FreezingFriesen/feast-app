import { ChipSelect } from "@/components/form/ChipSelect";
import { SegmentedControl } from "@/components/SegmentedControl";
import { TextAction } from "@/components/TextAction";
import { toggleChoice } from "@/features/account/dietaryRestrictionsForm";
import { SORT_LABELS } from "@/features/recipes/filter/recipeSort";
import { colors, spacing, typography } from "@/theme";
import { RECIPE_SORTS, type RecipeFilter } from "@/validation/recipeFilterSchema";
import { ALLERGENS, DIET_TAGS, MEAL_TYPES } from "@/validation/recipeSchema";
import { StyleSheet, Text, View } from "react-native";
import { LabeledSwitch } from "./LabeledSwitch";

type RecipeFilterPanelProps = {
  filters: RecipeFilter;
  // Every change goes through recipeFilterSchema in the hook before it's applied.
  onChange: (next: RecipeFilter) => void;
  onClear: () => void;
  activeFilterCount: number;
};

// The ad-hoc filters and the sort (#10, N-03), opened from "Filters" on the Recipes tab.
// No mockup shows a filter UI, so it's built from the shared form parts.
export function RecipeFilterPanel({ filters, onChange, onClear, activeFilterCount }: RecipeFilterPanelProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.groupTitle} accessibilityRole="header">
        Diet
      </Text>
      <ChipSelect
        options={DIET_TAGS}
        selected={filters.diets}
        onToggle={(diet) => onChange({ ...filters, diets: toggleChoice(filters.diets, diet) })}
      />

      <Text style={styles.groupTitle} accessibilityRole="header">
        Leave out allergens
      </Text>
      <ChipSelect
        options={ALLERGENS}
        selected={filters.excludeAllergens}
        onToggle={(allergen) =>
          onChange({ ...filters, excludeAllergens: toggleChoice(filters.excludeAllergens, allergen) })
        }
      />

      <Text style={styles.groupTitle} accessibilityRole="header">
        Meal
      </Text>
      <ChipSelect
        options={MEAL_TYPES}
        selected={filters.mealTypes}
        onToggle={(mealType) => onChange({ ...filters, mealTypes: toggleChoice(filters.mealTypes, mealType) })}
      />

      <View style={styles.switch}>
        <LabeledSwitch
          label="Also hide recipes with ingredients Feast couldn't check"
          caption="Applies while allergens are being left out."
          value={filters.hideUnchecked}
          onValueChange={(hideUnchecked) => onChange({ ...filters, hideUnchecked })}
        />
      </View>

      <Text style={styles.groupTitle} accessibilityRole="header">
        Sort
      </Text>
      <SegmentedControl
        options={RECIPE_SORTS}
        value={filters.sort}
        onChange={(sort) => onChange({ ...filters, sort })}
        formatLabel={(sort) => SORT_LABELS[sort]}
      />

      <TextAction label="Clear filters" align="start" disabled={activeFilterCount === 0} onPress={onClear} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingBottom: spacing.xs,
  },
  groupTitle: {
    ...typography.label,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  switch: {
    marginTop: spacing.md,
  },
});
