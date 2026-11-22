// Choose a recipe to add to one meal slot (date + Breakfast/Lunch/Dinner).
// Recipes tagged with the slot's meal type are listed first. The user's allergies and
// diets filter the list by default, as on the Recipes tab (#10, N-04).
import { EmptyState } from "@/components/EmptyState";
import { formatOptionLabel } from "@/components/form/formatOptionLabel";
import { FieldError } from "@/components/form/FormField";
import { SubmitButton } from "@/components/form/SubmitButton";
import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { formatServings } from "@/features/meal-planner/components/DaySlots";
import { formatDay, type DateKey } from "@/features/meal-planner/dates";
import { pickRecipeSections, pickRowAccessibilityLabel } from "@/features/meal-planner/pickRecipeSections";
import { writeErrorMessage } from "@/features/meal-planner/writeErrorMessage";
import { ProfileFilterBanners } from "@/features/recipes/components/ProfileFilterBanners";
import { RecipeRowNotes } from "@/features/recipes/components/RecipeRowNotes";
import type { RecipeRowView } from "@/features/recipes/filter/recipeListState";
import { useFilteredRecipes } from "@/features/recipes/useFilteredRecipes";
import type { Recipe } from "@/repositories/RecipeRepository";
import { useMealPlanRepository } from "@/repositories/RepositoryProvider";
import { borderWidth, colors, radius, spacing, typography } from "@/theme";
import { plannerSlotParamsSchema, type PlannerMealType } from "@/validation/mealPlanSchema";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from "react-native";

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
  // The recipes the user's allergy & diet filter leaves, with their notes. The filter
  // starts on every time the picker opens, whatever the Recipes tab is set to.
  const list = useFilteredRecipes();
  const [error, setError] = useState<string | null>(null);
  // True while the meal is being added, so a second recipe can't be tapped meanwhile.
  const [saving, setSaving] = useState(false);
  // "breakfast" -> "Breakfast", for the title and section headings.
  const label = formatOptionLabel(mealType);
  const { state } = list;

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

  // Recipes tagged with this slot's meal type, then the rest (pickRecipeSections).
  const sections = state.kind === "ready" ? pickRecipeSections(state.rows, mealType) : [];

  return (
    <>
      {/* The header title names the slot, e.g. "Dinner · Tue, Nov 3". */}
      <Stack.Screen options={{ title: `${label} · ${formatDay(date)}` }} />
      {state.kind === "loading" ? (
        // Until the recipes, the profile and the ingredient data have loaded: never an
        // unfiltered list that looks filtered.
        <View style={styles.loading}>
          <ActivityIndicator color={colors.action} accessibilityLabel="Loading your recipes" />
        </View>
      ) : (
        // SectionList is a list with headings, which scroll away with the list (not
        // sticky). Each recipe is a button that adds it to the slot.
        <SectionList
          sections={sections}
          keyExtractor={(row) => row.recipe.id}
          contentContainerStyle={[styles.list, sections.length === 0 && styles.grow]}
          stickySectionHeadersEnabled={false}
          // The allergy & diet filter (no links here: this is a popup, and switching tabs
          // from one isn't reliable), then any error (e.g. the slot is full).
          ListHeaderComponent={
            <View>
              {state.showHeader ? (
                <ProfileFilterBanners
                  state={state}
                  onProfileFilterChange={list.setProfileFilterOn}
                  onRetryProfile={list.retryProfile}
                />
              ) : null}
              {error ? <FieldError message={error} /> : null}
            </View>
          }
          ListEmptyComponent={
            state.empty?.kind === "no_matches" ? (
              // Recipes exist, but the allergy & diet filter hides them all.
              <EmptyState
                icon="funnel-outline"
                title="No recipes match your allergies & diets"
                description="Your allergy & diet filter hides every recipe."
              >
                {state.empty.canTurnOffProfile ? (
                  <SubmitButton
                    label="Turn off my allergy & diet filter"
                    variant="secondary"
                    onPress={() => list.setProfileFilterOn(false)}
                  />
                ) : null}
              </EmptyState>
            ) : (
              // The user has no recipes at all.
              <EmptyState icon="book-outline" title="No recipes yet" description="Create a recipe, then add it to your plan.">
                {/* navigate is what a Link does, so this behaves like the link it replaces. */}
                <SubmitButton label="Create a recipe" onPress={() => router.navigate("/recipes/new")} />
              </EmptyState>
            )
          }
          renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
          renderItem={({ item }) => <PickRow row={item} disabled={saving} onPick={() => handlePick(item.recipe)} />}
        />
      )}
    </>
  );
}

// One recipe: its title, servings and any allergen or diet notes. The label read out
// includes the notes, because the whole row is one button.
function PickRow({ row, disabled, onPick }: { row: RecipeRowView; disabled: boolean; onPick: () => void }) {
  return (
    <Pressable
      onPress={onPick}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={pickRowAccessibilityLabel(row)}
      style={[styles.item, disabled && styles.itemDisabled]}
    >
      <Text style={styles.itemTitle}>{row.recipe.title}</Text>
      <Text style={styles.itemMeta}>{formatServings(row.recipe.servings)}</Text>
      <RecipeRowNotes notes={row.notes} />
    </Pressable>
  );
}

// White cards with a thin edge, under small capital headings.
const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  grow: {
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
