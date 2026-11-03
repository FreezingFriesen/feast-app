import { Stack } from "expo-router";

// This layout is shared across all the routes defined in the /recipes directory.
// "index" is the recipe list and "new" is the form for creating a recipe. The form
// opens on top of the list, and the back button returns to it.
export default function RecipesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Recipes" }} />
      <Stack.Screen name="new" options={{ title: "New Recipe" }} />
    </Stack>
  );
}
