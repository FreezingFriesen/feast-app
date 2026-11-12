import { stackHeader } from "@/components/AppHeader";
import { stackScreenOptions } from "@/theme";
import { Stack } from "expo-router";

// This layout is shared across all the routes defined in the /recipes directory.
// "index" is the recipe list, "new" is the form for creating a recipe, and "edit/[id]"
// is the same form filled in with a saved recipe. The forms open on top of the list,
// and the back button returns to it. Every screen uses the Feast header (AppHeader).
export default function RecipesLayout() {
  return (
    <Stack screenOptions={{ ...stackScreenOptions, header: stackHeader }}>
      <Stack.Screen name="index" options={{ title: "Recipes" }} />
      <Stack.Screen name="new" options={{ title: "New Recipe" }} />
      <Stack.Screen name="edit/[id]" options={{ title: "Edit Recipe" }} />
    </Stack>
  );
}
