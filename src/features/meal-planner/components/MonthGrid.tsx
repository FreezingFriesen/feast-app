import { formatOptionLabel } from "@/components/form/ChipSelect";
import { PLANNER_MEAL_TYPES } from "@/validation/mealPlanSchema";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  dayOfMonth,
  formatDay,
  formatMonthYear,
  monthGrid,
  WEEKDAY_LABELS,
  type DateKey,
} from "../dates";
import type { DaySlotEntries } from "../groupEntries";
import { MEAL_TYPE_COLORS } from "../mealTypeColors";

type MonthGridProps = {
  // Any day in the month to show.
  monthKey: DateKey;
  todayKey: DateKey;
  selectedKey?: DateKey;
  days: ReadonlyMap<DateKey, DaySlotEntries>;
  onPressDay: (key: DateKey) => void;
  onChangeMonth: (months: number) => void;
};

// Calendar for one month. Each day shows a dot for every slot with a meal planned.
export function MonthGrid({
  monthKey,
  todayKey,
  selectedKey,
  days,
  onPressDay,
  onChangeMonth,
}: MonthGridProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => onChangeMonth(-1)}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={12}
        >
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Text style={styles.month}>{formatMonthYear(monthKey)}</Text>
        <Pressable
          onPress={() => onChangeMonth(1)}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={12}
        >
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>

      {monthGrid(monthKey).map((week, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {week.map((key, cellIndex) => {
            if (key === null) {
              return <View key={`blank-${cellIndex}`} style={styles.cell} />;
            }
            const slots = days.get(key);
            const planned = PLANNER_MEAL_TYPES.filter((mealType) => (slots?.[mealType].length ?? 0) > 0);
            const isToday = key === todayKey;
            const isSelected = key === selectedKey;
            return (
              <Pressable
                key={key}
                onPress={() => onPressDay(key)}
                accessibilityRole="button"
                accessibilityLabel={
                  planned.length > 0
                    ? `${formatDay(key)}. ${planned.map(formatOptionLabel).join(", ")} planned`
                    : `${formatDay(key)}. Nothing planned`
                }
                style={[styles.cell, isSelected && styles.cellSelected]}
              >
                <View style={[styles.dayCircle, isToday && styles.todayCircle]}>
                  <Text style={[styles.dayNumber, isToday && styles.todayText]}>{dayOfMonth(key)}</Text>
                </View>
                <View style={styles.dots}>
                  {planned.map((mealType) => (
                    <View
                      key={mealType}
                      style={[styles.dot, { backgroundColor: MEAL_TYPE_COLORS[mealType] }]}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.legend}>
        {PLANNER_MEAL_TYPES.map((mealType) => (
          <View key={mealType} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: MEAL_TYPE_COLORS[mealType] }]} />
            <Text style={styles.legendText}>{formatOptionLabel(mealType)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  arrow: {
    fontSize: 28,
    color: "#208AEF",
    paddingHorizontal: 8,
  },
  month: {
    fontSize: 17,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
  },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    color: "#666",
    paddingVertical: 4,
  },
  cell: {
    flex: 1,
    height: 56,
    alignItems: "center",
    paddingTop: 4,
    borderRadius: 8,
  },
  cellSelected: {
    backgroundColor: "#e8f2fd",
  },
  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  todayCircle: {
    backgroundColor: "#208AEF",
  },
  dayNumber: {
    fontSize: 16,
  },
  todayText: {
    color: "#fff",
    fontWeight: "600",
  },
  dots: {
    flexDirection: "row",
    gap: 3,
    marginTop: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendText: {
    fontSize: 13,
    color: "#666",
  },
});
