// The meal planner (#4, #17, N-05). Month and Week tabs show the same plan:
// the month view opens a popup for the tapped day, and the week view shows the
// selected day's Breakfast, Lunch and Dinner slots under a strip of days.
import { SegmentedControl } from "@/components/SegmentedControl";
import { DaySlots } from "@/features/meal-planner/components/DaySlots";
import { MonthGrid } from "@/features/meal-planner/components/MonthGrid";
import { WeekStrip } from "@/features/meal-planner/components/WeekStrip";
import { addMonths, formatDay, monthBounds, todayKey, weekBounds } from "@/features/meal-planner/dates";
import { emptyDaySlots, groupByDay } from "@/features/meal-planner/groupEntries";
import { useMealPlanEntries } from "@/features/meal-planner/useMealPlanEntries";
import { usePlannerNavigation } from "@/features/meal-planner/usePlannerNavigation";
import { useRecipesById } from "@/features/recipes/useRecipes";
import { Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

// The two tabs at the top of the planner. PlannerView is "month" or "week".
const VIEWS = ["month", "week"] as const;
type PlannerView = (typeof VIEWS)[number];

export default function MealPlannerScreen() {
  // Opens the day popup, the recipe picker, or the edit screen for a planned meal.
  const navigation = usePlannerNavigation();
  // Every recipe, looked up by ID. Planned meals store only the recipe's ID.
  const recipesById = useRecipesById();
  // Today's date as "YYYY-MM-DD".
  const today = todayKey();
  // Which tab is showing. The planner opens on the Week tab.
  const [view, setView] = useState<PlannerView>("week");
  // The day both views are centred on. It is kept when switching between Month and Week.
  const [focusDate, setFocusDate] = useState(today);

  // Only load the entries the current view shows.
  const range = view === "month" ? monthBounds(focusDate) : weekBounds(focusDate);
  // The planned meals, grouped by day and then into Breakfast, Lunch and Dinner.
  // Updates by itself when a meal is added, moved or removed.
  const days = groupByDay(useMealPlanEntries(range.start, range.end));

  return (
    <>
      {/* Show a "Today" button in the header once the user has moved away from today. */}
      <Stack.Screen
        options={{
          headerRight:
            focusDate === today
              ? undefined
              : () => (
                  <Pressable
                    onPress={() => setFocusDate(today)}
                    accessibilityRole="button"
                    accessibilityLabel="Go to today"
                    hitSlop={8}
                  >
                    <Text style={styles.headerButton}>Today</Text>
                  </Pressable>
                ),
        }}
      />
      <ScrollView contentContainerStyle={styles.container}>
        {/* The Month / Week switch. */}
        <SegmentedControl options={VIEWS} value={view} onChange={setView} />

        {/* Month view: a calendar. Tapping a day selects it and opens that day's popup.
            The arrows move back or forward a month. */}
        {view === "month" ? (
          <MonthGrid
            monthKey={focusDate}
            todayKey={today}
            selectedKey={focusDate}
            days={days}
            onPressDay={(key) => {
              setFocusDate(key);
              navigation.openDay(key);
            }}
            onChangeMonth={(months) => setFocusDate(addMonths(focusDate, months))}
          />
        ) : (
          // Week view: a row of days (with a dot on days that have meals), then the
          // selected day's Breakfast, Lunch and Dinner slots. Tapping "Add" in a slot
          // opens the recipe picker; tapping a meal opens it for editing.
          <>
            <WeekStrip
              selectedKey={focusDate}
              onSelect={setFocusDate}
              todayKey={today}
              hasMeals={(key) => days.has(key)}
            />
            <Text style={styles.dayTitle}>{formatDay(focusDate)}</Text>
            {/* A day with nothing planned gets three empty slots. */}
            <DaySlots
              slots={days.get(focusDate) ?? emptyDaySlots()}
              recipesById={recipesById}
              onAdd={(mealType) => navigation.addToSlot(focusDate, mealType)}
              onPressEntry={navigation.editEntry}
            />
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  headerButton: {
    color: "#208AEF",
    fontSize: 16,
    fontWeight: "600",
    paddingHorizontal: 8,
  },
  dayTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
});
