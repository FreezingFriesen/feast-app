// The popup for one day, opened by tapping a day in the month view.
// Shows the day's Breakfast, Lunch and Dinner slots.
import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { DaySlots } from "@/features/meal-planner/components/DaySlots";
import { formatDay, type DateKey } from "@/features/meal-planner/dates";
import { emptyDaySlots, groupByDay } from "@/features/meal-planner/groupEntries";
import { useMealPlanEntries } from "@/features/meal-planner/useMealPlanEntries";
import { usePlannerNavigation } from "@/features/meal-planner/usePlannerNavigation";
import { useRecipesById } from "@/features/recipes/useRecipes";
import { dateKeySchema } from "@/validation/mealPlanSchema";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

// The date comes from the link that opened this screen (/meal-planner/day/2026-11-03).
// If it isn't a real "YYYY-MM-DD" date, show a "not found" message instead.
export default function DayScreen() {
  // Route params are user-controllable (deep links), so validate before use.
  const { date } = useLocalSearchParams();
  const parsed = dateKeySchema.safeParse(date);
  if (!parsed.success) {
    return <PlaceholderScreen title="Day not found" description="Close this and pick a day from the calendar." />;
  }
  return <DayPlan date={parsed.data} />;
}

// The day's plan, shown once the date has been checked.
function DayPlan({ date }: { date: DateKey }) {
  const router = useRouter();
  const navigation = usePlannerNavigation();
  const recipesById = useRecipesById();
  // Only this one day's meals, split into Breakfast, Lunch and Dinner.
  // A day with nothing planned gets three empty slots.
  const slots = groupByDay(useMealPlanEntries(date, date)).get(date) ?? emptyDaySlots();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* This popup has no header bar (see _layout.tsx), so it draws its own title
          and a Done button that closes it. */}
      <View style={styles.header}>
        <Text style={styles.title}>{formatDay(date)}</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>
      {/* "Add" opens the recipe picker for that slot; tapping a meal opens it for editing. */}
      <DaySlots
        slots={slots}
        recipesById={recipesById}
        onAdd={(mealType) => navigation.addToSlot(date, mealType)}
        onPressEntry={navigation.editEntry}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingTop: 24,
    paddingBottom: 48,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
  },
  done: {
    color: "#208AEF",
    fontSize: 16,
    fontWeight: "600",
  },
});
