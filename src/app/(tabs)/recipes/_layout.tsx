import { stackHeader } from "@/components/AppHeader";
import { stackScreenOptions } from "@/theme";
import { Stack } from "expo-router";

// The recipe list sits under every recipe screen, even one opened from a link, so Back
// always returns to it.
export const unstable_settings = { anchor: "index" };

// This layout is shared across all the routes defined in the /recipes directory.
// "index" is the recipe list, "[id]" is one recipe (read-only), "new" is the form for
// creating a recipe, and "edit/[id]" is the same form filled in with a saved recipe.
// They open on top of the list, and the back button returns to it. Every screen uses the
// Feast header (AppHeader); the recipe screen draws its own, floating over the picture.
export default function RecipesLayout() {
  return (
    <Stack screenOptions={{ ...stackScreenOptions, header: stackHeader }}>
      <Stack.Screen name="index" options={{ title: "Recipes" }} />
      <Stack.Screen name="[id]" options={{ title: "Recipe", headerShown: false }} />
      <Stack.Screen name="new" options={{ title: "New Recipe" }} />
      <Stack.Screen name="edit/[id]" options={{ title: "Edit Recipe" }} />
    </Stack>
  );
}
