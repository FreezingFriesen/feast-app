import { Stack } from "expo-router";

// This layout is shared across all the routes defined in the /meal-planner directory.
export default function MealPlannerLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Meal Planner" }} />
      {/* The day popup opened from the month view. Android form sheets have no
          native header, so the screen draws its own title. */}
      <Stack.Screen
        name="day/[date]"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.6, 1],
          sheetGrabberVisible: true,
          headerShown: false,
        }}
      />
      <Stack.Screen name="pick-recipe" options={{ presentation: "modal", title: "Add recipe" }} />
      <Stack.Screen name="entry/[id]" options={{ presentation: "modal", title: "Edit meal" }} />
    </Stack>
  );
}
