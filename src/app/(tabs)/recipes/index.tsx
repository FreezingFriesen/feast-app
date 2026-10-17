import { useRecipes } from "@/features/recipes/useRecipes";
import { Link, Stack } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

// This screen displays a list of recipes and allows the user to navigate to the "New Recipe" screen.
export default function RecipesScreen() {
  const recipes = useRecipes();

  // Render the list of recipes or a message indicating that there are no recipes yet.
  return (
    <>
    {/* Add a header button to navigate to the "New Recipe" screen. */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/recipes/new" asChild>
              <Pressable accessibilityRole="button" accessibilityLabel="New recipe" hitSlop={8}>
                <Text style={styles.headerButton}>+ New</Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      {/* Render the list of recipes using a FlatList component. If there are no recipes, display a message and a button to create a new recipe. */}
      <FlatList
        data={recipes}
        keyExtractor={(recipe) => recipe.id}
        contentContainerStyle={recipes.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No recipes yet</Text>
            <Text style={styles.emptyDescription}>Your saved recipes will appear here.</Text>
            <Link href="/recipes/new" asChild>
              <Pressable accessibilityRole="button" style={styles.button}>
                <Text style={styles.buttonText}>Create a recipe</Text>
              </Pressable>
            </Link>
          </View>
        }
        // Render each recipe item in the list with its title, number of servings, and number of ingredients.
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.itemMeta}>
              {item.servings} servings · {item.ingredients.length} ingredients
            </Text>
          </View>
        )}
      />
    </>
  );
}

// Define styles for the components in the RecipesScreen.
const styles = StyleSheet.create({
  headerButton: {
    color: "#208AEF",
    fontSize: 16,
    fontWeight: "600",
    paddingHorizontal: 8,
  },
  list: {
    padding: 16,
    gap: 8,
  },
  emptyContainer: {
    flexGrow: 1,
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
  item: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#fff",
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
});
