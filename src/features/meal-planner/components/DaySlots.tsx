import { DecorativeIcon } from "@/components/DecorativeIcon";
import { formatOptionLabel } from "@/components/form/ChipSelect";
import { formatMinutes, totalMinutes } from "@/features/recipes/recipeTime";
import type { MealPlanEntry } from "@/repositories/MealPlanRepository";
import type { Recipe } from "@/repositories/RecipeRepository";
import { borderWidth, colors, iconSize, MIN_TOUCH_TARGET, radius, spacing, tileSize, typography } from "@/theme";
import { MAX_ENTRIES_PER_SLOT, PLANNER_MEAL_TYPES, type PlannerMealType } from "@/validation/mealPlanSchema";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { DaySlotEntries } from "../groupEntries";
import { MEAL_TYPE_ICONS } from "../mealTypeColors";

type DaySlotsProps = {
  // The day's planned meals, split into breakfast, lunch and dinner.
  slots: DaySlotEntries;
  // Used to show each meal's recipe name (a planned meal stores only the recipe's ID).
  recipesById: ReadonlyMap<string, Recipe>;
  // "Add a meal" was tapped in a slot.
  onAdd: (mealType: PlannerMealType) => void;
  // A planned meal was tapped, to edit it.
  onPressEntry: (entry: MealPlanEntry) => void;
};

// "1 serving" or "4 servings".
export function formatServings(servings: number): string {
  return servings === 1 ? "1 serving" : `${servings} servings`;
}

// The Breakfast, Lunch and Dinner slots for one day. Used by the week view and the day popup.
// As in the mockup: a heading per slot, then a card per planned meal.
export function DaySlots({ slots, recipesById, onAdd, onPressEntry }: DaySlotsProps) {
  return (
    <View style={styles.container}>
      {PLANNER_MEAL_TYPES.map((mealType) => {
        const entries = slots[mealType];
        const label = formatOptionLabel(mealType);
        return (
          <View key={mealType} style={styles.slot}>
            <Text style={styles.slotTitle} accessibilityRole="header">
              {label}
            </Text>

            {/* One card per planned meal: the slot's icon, the recipe name, its time (if
                the recipe has one) and servings. If its recipe was deleted, the card
                says "Recipe unavailable" but can still be opened and removed. */}
            {entries.map((entry) => {
              const recipe = recipesById.get(entry.recipeId);
              const title = recipe?.title ?? "Recipe unavailable";
              const minutes = recipe ? totalMinutes(recipe) : null;
              const time = minutes === null ? null : formatMinutes(minutes);
              const details = [time, formatServings(entry.servings)].filter(Boolean).join(" · ");
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => onPressEntry(entry)}
                  accessibilityRole="button"
                  accessibilityLabel={`${title}, ${details}. Edit`}
                  style={styles.entry}
                >
                  <View style={styles.tile}>
                    <DecorativeIcon name={MEAL_TYPE_ICONS[mealType]} size={iconSize.md} color={colors.action} />
                  </View>
                  <View style={styles.entryText}>
                    <Text style={[styles.entryTitle, !recipe && styles.unavailable]} numberOfLines={1}>
                      {title}
                    </Text>
                    <View style={styles.metaRow}>
                      {time ? <DecorativeIcon name="time-outline" size={iconSize.sm} color={colors.action} /> : null}
                      <Text style={styles.entryMeta}>{details}</Text>
                    </View>
                  </View>
                  <DecorativeIcon name="chevron-forward" size={iconSize.md} color={colors.accentText} />
                </Pressable>
              );
            })}

            {/* "Add a meal" disappears once the slot holds the most meals allowed. */}
            {entries.length < MAX_ENTRIES_PER_SLOT ? (
              <Pressable
                onPress={() => onAdd(mealType)}
                accessibilityRole="button"
                accessibilityLabel={`Add a recipe to ${label}`}
                style={styles.addButton}
              >
                <DecorativeIcon name="add-circle-outline" size={iconSize.md} color={colors.action} />
                <Text style={styles.addText}>Add a meal</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xl,
  },
  slot: {
    gap: spacing.sm,
  },
  slotTitle: {
    ...typography.sectionLabel,
    color: colors.text,
  },
  // A white card with a thin edge (no shadow, so lists stay fast).
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: borderWidth.thin,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  // Stands where the mockup has the recipe photo (recipes don't have photos yet).
  tile: {
    width: tileSize.md,
    height: tileSize.md,
    borderRadius: radius.sm,
    backgroundColor: colors.chrome,
    alignItems: "center",
    justifyContent: "center",
  },
  entryText: {
    flex: 1,
    gap: spacing.xxs,
  },
  entryTitle: {
    ...typography.itemTitle,
    color: colors.text,
  },
  unavailable: {
    color: colors.textMuted,
    fontStyle: "italic",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  entryMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  // Outlined in green, as in the mockup.
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: borderWidth.thick,
    borderColor: colors.action,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  addText: {
    ...typography.bodyStrong,
    color: colors.action,
  },
});
