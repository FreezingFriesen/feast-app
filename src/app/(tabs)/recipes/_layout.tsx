import { stackHeader } from "@/components/AppHeader";
import { stackScreenOptions } from "@/theme";
import { Stack } from "expo-router";

// This layout is shared across all the routes defined in the /recipes directory.
// "index" is the recipe list and "new" is the form for creating a recipe. The form
// opens on top of the list, and the back button returns to it. Every screen uses the
// Feast header (AppHeader).
export default function RecipesLayout() {
  return (
    <Stack screenOptions={{ ...stackScreenOptions, header: stackHeader }}>
      <Stack.Screen name="index" options={{ title: "Recipes" }} />
      <Stack.Screen name="new" options={{ title: "New Recipe" }} />
    </Stack>
  );
}
