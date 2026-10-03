import { Link, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { Recipe } from "@/repositories/RecipeRepository";
import { useRecipeRepository } from "@/repositories/RepositoryProvider";

export default function RecipesScreen() {
  const repository = useRecipeRepository();
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  useEffect(() => {
    let active = true;
    const load = () => {
      repository.list().then((list) => {
        if (active) setRecipes(list);
      });
    };
    load();
    const unsubscribe = repository.subscribe(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository]);

  return (
    <>
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
