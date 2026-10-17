import { formatOptionLabel } from "@/components/form/ChipSelect";
import type { MealPlanEntry } from "@/repositories/MealPlanRepository";
import type { Recipe } from "@/repositories/RecipeRepository";
import { MAX_ENTRIES_PER_SLOT, PLANNER_MEAL_TYPES, type PlannerMealType } from "@/validation/mealPlanSchema";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { DaySlotEntries } from "../groupEntries";
import { MEAL_TYPE_COLORS } from "../mealTypeColors";

type DaySlotsProps = {
  slots: DaySlotEntries;
  recipesById: ReadonlyMap<string, Recipe>;
  onAdd: (mealType: PlannerMealType) => void;
  onPressEntry: (entry: MealPlanEntry) => void;
};

export function formatServings(servings: number): string {
  return servings === 1 ? "1 serving" : `${servings} servings`;
}

// The Breakfast, Lunch and Dinner slots for one day. Used by the week view and the day popup.
export function DaySlots({ slots, recipesById, onAdd, onPressEntry }: DaySlotsProps) {
  return (
    <View style={styles.container}>
      {PLANNER_MEAL_TYPES.map((mealType) => {
        const entries = slots[mealType];
        const label = formatOptionLabel(mealType);
        return (
          <View key={mealType} style={styles.slot}>
            <View style={styles.slotHeader}>
              <View style={[styles.marker, { backgroundColor: MEAL_TYPE_COLORS[mealType] }]} />
              <Text style={styles.slotTitle}>{label}</Text>
            </View>

            {entries.map((entry) => {
              const recipe = recipesById.get(entry.recipeId);
              const title = recipe?.title ?? "Recipe unavailable";
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => onPressEntry(entry)}
                  accessibilityRole="button"
                  accessibilityLabel={`${title}, ${formatServings(entry.servings)}. Edit`}
                  style={styles.entry}
                >
                  <Text style={[styles.entryTitle, !recipe && styles.unavailable]} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={styles.entryMeta}>{formatServings(entry.servings)}</Text>
                </Pressable>
              );
            })}

            {entries.length < MAX_ENTRIES_PER_SLOT ? (
              <Pressable
                onPress={() => onAdd(mealType)}
                accessibilityRole="button"
                accessibilityLabel={`Add a recipe to ${label}`}
                style={styles.addButton}
              >
                <Text style={styles.addText}>+ Add</Text>
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
    gap: 12,
  },
  slot: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#fff",
    gap: 6,
  },
  slotHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  marker: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  slotTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: "#f5f7fa",
  },
  entryTitle: {
    flexShrink: 1,
    fontSize: 16,
  },
  unavailable: {
    color: "#999",
    fontStyle: "italic",
  },
  entryMeta: {
    fontSize: 14,
    color: "#666",
  },
  addButton: {
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  addText: {
    color: "#208AEF",
    fontSize: 16,
    fontWeight: "600",
  },
});
