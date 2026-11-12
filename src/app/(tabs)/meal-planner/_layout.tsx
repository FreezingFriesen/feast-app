import { stackHeader } from "@/components/AppHeader";
import { modalScreenOptions, stackScreenOptions } from "@/theme";
import { Stack } from "expo-router";

// This layout is shared across all the routes defined in the /meal-planner directory.
// The planner is the main screen, with the Feast header (AppHeader). The other three
// open on top of it.
export default function MealPlannerLayout() {
  return (
    <Stack screenOptions={{ ...stackScreenOptions, header: stackHeader }}>
      <Stack.Screen name="index" options={{ title: "Meal Planner" }} />
      {/* The day popup opened from the month view. Android form sheets have no
          native header, so the screen draws its own title. */}
      {/* formSheet slides up from the bottom. It stops at 60% of the screen height and
          can be dragged up to full height (the grabber is the small bar at the top). */}
      <Stack.Screen
        name="day/[date]"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.6, 1],
          sheetGrabberVisible: true,
          headerShown: false,
        }}
      />
      {/* Choosing a recipe for a slot, and editing a planned meal, open as popups
          (modals) on top of the planner. They keep the phone's own header, in the
          Feast colours (see modalScreenOptions). */}
      <Stack.Screen name="pick-recipe" options={{ ...modalScreenOptions, title: "Add recipe" }} />
      <Stack.Screen name="entry/[id]" options={{ ...modalScreenOptions, title: "Edit meal" }} />
    </Stack>
  );
}
