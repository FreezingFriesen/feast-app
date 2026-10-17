// Choose a recipe to add to one meal slot (date + Breakfast/Lunch/Dinner).
// Recipes tagged with the slot's meal type are listed first.
import { formatOptionLabel } from "@/components/form/ChipSelect";
import { FieldError } from "@/components/form/FormField";
import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { formatServings } from "@/features/meal-planner/components/DaySlots";
import { formatDay, type DateKey } from "@/features/meal-planner/dates";
import { writeErrorMessage } from "@/features/meal-planner/writeErrorMessage";
import { useRecipes } from "@/features/recipes/useRecipes";
import type { Recipe } from "@/repositories/RecipeRepository";
import { useMealPlanRepository } from "@/repositories/RepositoryProvider";
import { plannerSlotParamsSchema, type PlannerMealType } from "@/validation/mealPlanSchema";
import { Link, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";

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
  const [saving, setSaving] = useState(false);
  const label = formatOptionLabel(mealType);

  const tagged = recipes.filter((recipe) => recipe.mealTypes.includes(mealType));
  const others = recipes.filter((recipe) => !recipe.mealTypes.includes(mealType));
  const sections = [
    { title: `Tagged ${label}`, data: tagged },
    { title: tagged.length > 0 ? "Other recipes" : "All recipes", data: others },
  ].filter((section) => section.data.length > 0);

  // Adds the recipe at its own serving size; the user can change it afterwards.
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
      <Stack.Screen options={{ title: `${label} · ${formatDay(date)}` }} />
      <SectionList
        sections={sections}
        keyExtractor={(recipe) => recipe.id}
        contentContainerStyle={sections.length === 0 ? styles.emptyContainer : styles.list}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={error ? <FieldError message={error} /> : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No recipes yet</Text>
            <Text style={styles.emptyDescription}>Create a recipe, then add it to your plan.</Text>
            <Link href="/recipes/new" asChild>
              <Pressable accessibilityRole="button" style={styles.button}>
                <Text style={styles.buttonText}>Create a recipe</Text>
              </Pressable>
            </Link>
          </View>
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

const styles = StyleSheet.create({
  list: {
    padding: 16,
    gap: 8,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    marginTop: 8,
  },
  item: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#fff",
  },
  itemDisabled: {
    opacity: 0.6,
  },
  itemTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  itemMeta: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#208AEF",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
