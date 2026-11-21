// The Recipes tab: the user's saved recipes (#1, N-01), filtered and sorted by diet,
// allergens and meal type (#10, N-04, part of N-03). The user's own allergies and diets
// apply by default; see src/features/recipes/filter/ for the rules.
import { DecorativeIcon } from "@/components/DecorativeIcon";
import { EmptyState } from "@/components/EmptyState";
import { SubmitButton } from "@/components/form/SubmitButton";
import { HeaderTextButton } from "@/components/HeaderTextButton";
import { RecipeListHeader } from "@/features/recipes/components/RecipeListHeader";
import { RecipeRowNotes } from "@/features/recipes/components/RecipeRowNotes";
import type { RecipeListEmpty, RecipeRowView } from "@/features/recipes/filter/recipeListState";
import { useFilteredRecipes } from "@/features/recipes/useFilteredRecipes";
import { borderWidth, colors, iconSize, MIN_TOUCH_TARGET, radius, spacing, typography } from "@/theme";
import type { RecipeFilter } from "@/validation/recipeFilterSchema";
import { Link, Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

// This screen displays the list of recipes and allows the user to navigate to the "New Recipe" screen.
export default function RecipesScreen() {
  const router = useRouter();
  // The recipes to show (newest first by default) and everything around them. The list
  // updates by itself when a recipe is added or the ingredient data arrives.
  const list = useFilteredRecipes();
  // Whether the Filters panel is open. In memory only, like the filters.
  const [panelOpen, setPanelOpen] = useState(false);
  const { state } = list;

  return (
    <>
      {/* Add a header button to navigate to the "New Recipe" screen. */}
      {/* asChild makes the button inside behave as the link, so it keeps its own look. */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/recipes/new" asChild>
              <HeaderTextButton label="+ New" accessibilityLabel="New recipe" />
            </Link>
          ),
        }}
      />
      {state.kind === "loading" ? (
        // Until the recipes, the profile and the ingredient data have loaded: never an
        // unfiltered list that looks filtered.
        <View style={styles.loading}>
          <ActivityIndicator color={colors.action} accessibilityLabel="Loading your recipes" />
        </View>
      ) : (
        // FlatList only draws the rows that are on screen, so long lists stay fast.
        <FlatList
          data={state.rows}
          // Each row needs a unique key so React can tell the rows apart.
          keyExtractor={(row) => row.recipe.id}
          // With nothing to list, the list stretches to full height so the message is centred.
          contentContainerStyle={[styles.list, state.rows.length === 0 && styles.grow]}
          ListHeaderComponent={
            state.showHeader ? (
              <RecipeListHeader
                state={state}
                filters={list.filters}
                onFiltersChange={(next: RecipeFilter) => list.setFilters(next)}
                onClearFilters={list.clearAdHoc}
                onProfileFilterChange={list.setProfileFilterOn}
                onRetryProfile={list.retryProfile}
                panelOpen={panelOpen}
                onTogglePanel={() => setPanelOpen((open) => !open)}
              />
            ) : null
          }
          ListEmptyComponent={
            <ListEmpty
              empty={state.empty}
              onCreate={() => router.navigate("/recipes/new")}
              onClearFilters={list.clearAdHoc}
              onTurnOffProfile={() => list.setProfileFilterOn(false)}
            />
          }
          // Each recipe with its servings and number of ingredients, any allergen or diet
          // notes, and an edit button. Only the button opens the editor: tapping the row
          // itself is kept for the recipe detail screen (not built yet), so a stray tap
          // can't start an edit.
          renderItem={({ item }) => (
            <RecipeRow
              row={item}
              onEdit={() => router.push({ pathname: "/recipes/edit/[id]", params: { id: item.recipe.id } })}
            />
          )}
        />
      )}
    </>
  );
}

function RecipeRow({ row, onEdit }: { row: RecipeRowView; onEdit: () => void }) {
  const { recipe } = row;
  return (
    <View style={styles.item}>
      <View style={styles.itemText}>
        <Text style={styles.itemTitle}>{recipe.title}</Text>
        <Text style={styles.itemMeta}>
          {recipe.servings} servings · {recipe.ingredients.length} ingredients
        </Text>
        <RecipeRowNotes notes={row.notes} />
      </View>
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${recipe.title}`}
        style={styles.editButton}
      >
        <DecorativeIcon name="create-outline" size={iconSize.lg} color={colors.action} />
      </Pressable>
    </View>
  );
}

type ListEmptyProps = {
  empty: RecipeListEmpty | null;
  onCreate: () => void;
  onClearFilters: () => void;
  onTurnOffProfile: () => void;
};

// No recipes at all, or none that match: each with its way out.
function ListEmpty({ empty, onCreate, onClearFilters, onTurnOffProfile }: ListEmptyProps) {
  if (empty === null) return null;
  if (empty.kind === "no_recipes") {
    return (
      <EmptyState icon="book-outline" title="No recipes yet" description="Your saved recipes will appear here.">
        {/* navigate is what a Link does, so this behaves like the link it replaces. */}
        <SubmitButton label="Create a recipe" onPress={onCreate} />
      </EmptyState>
    );
  }
  return (
    <EmptyState
      icon="funnel-outline"
      title="No recipes match your filters"
      description="Change or clear the filters to see more recipes."
    >
      <View style={styles.emptyActions}>
        {empty.canClearFilters ? <SubmitButton label="Clear filters" variant="secondary" onPress={onClearFilters} /> : null}
        {empty.canTurnOffProfile ? (
          <SubmitButton label="Turn off my allergy & diet filter" variant="secondary" onPress={onTurnOffProfile} />
        ) : null}
      </View>
    </EmptyState>
  );
}

// White cards with a thin edge, as in the mockups. No shadows on list rows, so
// scrolling stays fast.
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
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: borderWidth.thin,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  // Takes the room the edit button doesn't, so long titles wrap instead of pushing it off.
  itemText: {
    flex: 1,
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
  // A 44-point square around the pencil icon. The negative margins keep the row as
  // tall as it was, and line the icon up with the card's padding.
  editButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: -spacing.sm,
    marginRight: -spacing.sm,
  },
  emptyActions: {
    alignSelf: "stretch",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
