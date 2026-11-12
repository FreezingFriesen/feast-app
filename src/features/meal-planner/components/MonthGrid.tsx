import { DecorativeIcon } from "@/components/DecorativeIcon";
import { formatOptionLabel } from "@/components/form/ChipSelect";
import { borderWidth, colors, iconSize, MARKER_SIZE, MIN_TOUCH_TARGET, radius, spacing, typography } from "@/theme";
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
import { MEAL_MARKER_OUTLINE, MEAL_TYPE_COLORS } from "../mealTypeColors";

// The height of one day in the calendar, and of the circle round its number.
const CELL_HEIGHT = 56;
const DAY_CIRCLE_SIZE = 30;

type MonthGridProps = {
  // Any day in the month to show.
  monthKey: DateKey;
  // Today gets a filled circle.
  todayKey: DateKey;
  // The highlighted day, if any.
  selectedKey?: DateKey;
  // The month's planned meals, by day.
  days: ReadonlyMap<DateKey, DaySlotEntries>;
  // A day was tapped.
  onPressDay: (key: DateKey) => void;
  // An arrow was tapped: -1 for the previous month, 1 for the next.
  onChangeMonth: (months: number) => void;
};

// Calendar for one month. Each day shows a marker for every slot with a meal planned.
// The markers are always in the same place (breakfast, lunch, dinner, left to right) and
// have an outline, so they don't depend on colour alone.
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
      {/* The top line: "NOVEMBER 2026", then the previous- and next-month arrows. */}
      <View style={styles.header}>
        <Text style={styles.month}>{formatMonthYear(monthKey)}</Text>
        <View style={styles.arrows}>
          <Pressable
            onPress={() => onChangeMonth(-1)}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            style={styles.arrow}
          >
            <DecorativeIcon name="chevron-back" size={iconSize.lg} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => onChangeMonth(1)}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            style={styles.arrow}
          >
            <DecorativeIcon name="chevron-forward" size={iconSize.lg} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Column headings, Mon to Sun. */}
      <View style={styles.row}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>

      {/* One row per week. Cells before the 1st and after the last day are blank. */}
      {monthGrid(monthKey).map((week, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {week.map((key, cellIndex) => {
            if (key === null) {
              return <View key={`blank-${cellIndex}`} style={styles.cell} />;
            }
            const slots = days.get(key);
            // The meal types with at least one meal planned this day, e.g. ["lunch", "dinner"].
            const planned = PLANNER_MEAL_TYPES.filter((mealType) => (slots?.[mealType].length ?? 0) > 0);
            const isToday = key === todayKey;
            const isSelected = key === selectedKey;
            return (
              // Screen readers hear the date and what's planned, since they can't see the markers.
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
                {/* A place for each meal type; only the planned ones are drawn. */}
                <View style={styles.markers}>
                  {PLANNER_MEAL_TYPES.map((mealType) => (
                    <View
                      key={mealType}
                      style={[
                        styles.marker,
                        { backgroundColor: MEAL_TYPE_COLORS[mealType] },
                        !planned.includes(mealType) && styles.markerHidden,
                      ]}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      {/* The key under the calendar: which marker is which meal. */}
      <View style={styles.legend}>
        {PLANNER_MEAL_TYPES.map((mealType) => (
          <View key={mealType} style={styles.legendItem}>
            <View style={[styles.marker, { backgroundColor: MEAL_TYPE_COLORS[mealType] }]} />
            <Text style={styles.legendText}>{formatOptionLabel(mealType)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  month: {
    ...typography.sectionLabel,
    color: colors.text,
  },
  arrows: {
    flexDirection: "row",
  },
  arrow: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
  },
  weekday: {
    ...typography.small,
    flex: 1,
    textAlign: "center",
    color: colors.textMuted,
    paddingVertical: spacing.xs,
  },
  cell: {
    flex: 1,
    height: CELL_HEIGHT,
    alignItems: "center",
    paddingTop: spacing.xs,
    borderRadius: radius.sm,
  },
  cellSelected: {
    backgroundColor: colors.selectedTint,
  },
  dayCircle: {
    width: DAY_CIRCLE_SIZE,
    height: DAY_CIRCLE_SIZE,
    borderRadius: DAY_CIRCLE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  todayCircle: {
    backgroundColor: colors.action,
  },
  dayNumber: {
    ...typography.body,
    color: colors.text,
  },
  todayText: {
    ...typography.bodyStrong,
    color: colors.onAction,
  },
  markers: {
    flexDirection: "row",
    gap: spacing.xxs,
    marginTop: spacing.xs,
  },
  // A coloured dot with an ink outline.
  marker: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    borderWidth: borderWidth.thin,
    borderColor: MEAL_MARKER_OUTLINE,
  },
  // Keeps its place, so the other markers don't move.
  markerHidden: {
    opacity: 0,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
