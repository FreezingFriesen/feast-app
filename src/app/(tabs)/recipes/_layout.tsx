import { Stack } from "expo-router";

// This layout is shared across all the routes defined in the /recipes directory.
export default function RecipesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Recipes" }} />
      <Stack.Screen name="new" options={{ title: "New Recipe" }} />
    </Stack>
  );
}
