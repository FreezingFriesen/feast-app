// Choose a recipe to add to one meal slot (date + Breakfast/Lunch/Dinner).
// Recipes tagged with the slot's meal type are listed first.
import { EmptyState } from "@/components/EmptyState";
import { formatOptionLabel } from "@/components/form/ChipSelect";
import { FieldError } from "@/components/form/FormField";
import { SubmitButton } from "@/components/form/SubmitButton";
import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { formatServings } from "@/features/meal-planner/components/DaySlots";
import { formatDay, type DateKey } from "@/features/meal-planner/dates";
import { writeErrorMessage } from "@/features/meal-planner/writeErrorMessage";
import { useRecipes } from "@/features/recipes/useRecipes";
import type { Recipe } from "@/repositories/RecipeRepository";
import { useMealPlanRepository } from "@/repositories/RepositoryProvider";
import { borderWidth, colors, radius, spacing, typography } from "@/theme";
import { plannerSlotParamsSchema, type PlannerMealType } from "@/validation/mealPlanSchema";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, SectionList, StyleSheet, Text } from "react-native";

// The date and meal type come from the link that opened this screen. If either one
// isn't valid, show a "not found" message instead of the picker.
export default function PickRecipeScreen() {
  // Route params are user-controllable (deep links), so validate before use.
  const params = useLocalSearchParams();
  const parsed = plannerSlotParamsSchema.safeParse({ date: params.date, mealType: params.mealType });
  if (!parsed.success) {
    return <PlaceholderScreen title="Meal slot not found" description="Close this and choose a slot in the planner." />;
  }
  return <RecipePicker date={parsed.data.date} mealType={parsed.data.mealType} />;
}

function RecipePicker({ date, mealType }: { date: DateKey; mealType: PlannerMealType }) {
  const router = useRouter();
  const mealPlans = useMealPlanRepository();
  const recipes = useRecipes();
  const [error, setError] = useState<string | null>(null);
  // True while the meal is being added, so a second recipe can't be tapped meanwhile.
  const [saving, setSaving] = useState(false);
  // "breakfast" -> "Breakfast", for the title and section headings.
  const label = formatOptionLabel(mealType);

  // Split the recipes into two groups: those tagged with this slot's meal type, and the
  // rest. A group with no recipes in it is left out, so no empty heading is shown.
  const tagged = recipes.filter((recipe) => recipe.mealTypes.includes(mealType));
  const others = recipes.filter((recipe) => !recipe.mealTypes.includes(mealType));
  const sections = [
    { title: `Tagged ${label}`, data: tagged },
    { title: tagged.length > 0 ? "Other recipes" : "All recipes", data: others },
  ].filter((section) => section.data.length > 0);

  // Adds the recipe at its own serving size; the user can change it afterwards.
  // The plan stores only the recipe's ID, not a copy of the recipe. On success, close
  // the picker and go back to the planner.
  async function handlePick(recipe: Recipe) {
    setSaving(true);
    setError(null);
    try {
      const result = await mealPlans.add({
        date,
        mealType,
        recipeId: recipe.id,
        servings: recipe.servings,
      });
      if (!result.ok) {
        setError(writeErrorMessage(result));
        return;
      }
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* The header title names the slot, e.g. "Dinner · Tue, Nov 3". */}
      <Stack.Screen options={{ title: `${label} · ${formatDay(date)}` }} />
      {/* SectionList is a list with headings, which scroll away with the list (not
          sticky). Each recipe is a button that adds it to the slot. */}
      <SectionList
        sections={sections}
        keyExtractor={(recipe) => recipe.id}
        contentContainerStyle={sections.length === 0 ? styles.emptyContainer : styles.list}
        stickySectionHeadersEnabled={false}
        // An error (e.g. the slot is full) is shown at the top of the list.
        ListHeaderComponent={error ? <FieldError message={error} /> : null}
        // Shown when the user has no recipes at all.
        ListEmptyComponent={
          <EmptyState
            icon="book-outline"
            title="No recipes yet"
            description="Create a recipe, then add it to your plan."
          >
            {/* navigate is what a Link does, so this behaves like the link it replaces. */}
            <SubmitButton label="Create a recipe" onPress={() => router.navigate("/recipes/new")} />
          </EmptyState>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handlePick(item)}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.title}`}
            style={[styles.item, saving && styles.itemDisabled]}
          >
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.itemMeta}>{formatServings(item.servings)}</Text>
          </Pressable>
        )}
      />
    </>
  );
}

// White cards with a thin edge, under small capital headings.
const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  sectionTitle: {
    ...typography.sectionLabel,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  item: {
    borderWidth: borderWidth.thin,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  itemDisabled: {
    opacity: 0.6,
  },
  itemTitle: {
    ...typography.itemTitle,
    color: colors.text,
  },
  itemMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
});
