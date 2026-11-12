// The Recipes tab: a list of the user's saved recipes (#1, N-01).
import { DecorativeIcon } from "@/components/DecorativeIcon";
import { EmptyState } from "@/components/EmptyState";
import { SubmitButton } from "@/components/form/SubmitButton";
import { HeaderTextButton } from "@/components/HeaderTextButton";
import { useRecipes } from "@/features/recipes/useRecipes";
import { borderWidth, colors, iconSize, MIN_TOUCH_TARGET, radius, spacing, typography } from "@/theme";
import { Link, Stack, useRouter } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

// This screen displays a list of recipes and allows the user to navigate to the "New Recipe" screen.
export default function RecipesScreen() {
  const router = useRouter();
  // All saved recipes, newest first. The list updates by itself when a recipe is added.
  const recipes = useRecipes();

  // Render the list of recipes or a message indicating that there are no recipes yet.
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
      {/* Render the list of recipes using a FlatList component. If there are no recipes, display a message and a button to create a new recipe. */}
      {/* FlatList only draws the rows that are on screen, so long lists stay fast. */}
      <FlatList
        data={recipes}
        // Each row needs a unique key so React can tell the rows apart.
        keyExtractor={(recipe) => recipe.id}
        // With no recipes, the list stretches to full height so the message is centred.
        contentContainerStyle={recipes.length === 0 ? styles.emptyContainer : styles.list}
        // Shown instead of the list when there are no recipes.
        ListEmptyComponent={
          <EmptyState icon="book-outline" title="No recipes yet" description="Your saved recipes will appear here.">
            {/* navigate is what a Link does, so this behaves like the link it replaces. */}
            <SubmitButton label="Create a recipe" onPress={() => router.navigate("/recipes/new")} />
          </EmptyState>
        }
        // Render each recipe item in the list with its title, number of servings, and number of ingredients,
        // plus an edit button. Only the button opens the editor: tapping the row itself is
        // kept for the recipe detail screen (not built yet), so a stray tap can't start an edit.
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.itemText}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemMeta}>
                {item.servings} servings · {item.ingredients.length} ingredients
              </Text>
            </View>
            <Pressable
              onPress={() => router.push({ pathname: "/recipes/edit/[id]", params: { id: item.id } })}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${item.title}`}
              style={styles.editButton}
            >
              <DecorativeIcon name="create-outline" size={iconSize.lg} color={colors.action} />
            </Pressable>
          </View>
        )}
      />
    </>
  );
}

// White cards with a thin edge, as in the mockups. No shadows on list rows, so
// scrolling stays fast.
const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyContainer: {
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
});
