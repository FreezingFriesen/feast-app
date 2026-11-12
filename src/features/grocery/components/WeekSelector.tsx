import { DecorativeIcon, type IconName } from "@/components/DecorativeIcon";
import { TextAction } from "@/components/TextAction";
import { addDays, formatWeekRange, type DateKey } from "@/features/meal-planner/dates";
import { colors, iconSize, MIN_TOUCH_TARGET, spacing, typography } from "@/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { isNavigableWeek } from "../groceryView";

type WeekSelectorProps = {
  // The Monday of the week shown.
  weekStart: DateKey;
  // The Monday of the current week, for "This week" and the way back to it.
  currentWeekStart: DateKey;
  // Called with the Monday of the week to show.
  onChange: (weekStart: DateKey) => void;
};

// Which week the grocery list is for: arrows to the previous and next week, the dates in
// between, and a way back to this week once the user has moved away from it.
export function WeekSelector({ weekStart, currentWeekStart, onChange }: WeekSelectorProps) {
  const previous = addDays(weekStart, -7);
  const next = addDays(weekStart, 7);
  const isCurrent = weekStart === currentWeekStart;
  const range = formatWeekRange(weekStart);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <WeekArrow
          icon="chevron-back"
          label="Previous week"
          disabled={!isNavigableWeek(previous)}
          onPress={() => onChange(previous)}
        />
        {/* The dates, with "This week" under them for the current week. */}
        <View style={styles.middle} accessible accessibilityRole="header" accessibilityLabel={`Week of ${range}${isCurrent ? ", this week" : ""}`}>
          <Text style={styles.range}>{range}</Text>
          {isCurrent ? <Text style={styles.caption}>This week</Text> : null}
        </View>
        <WeekArrow
          icon="chevron-forward"
          label="Next week"
          disabled={!isNavigableWeek(next)}
          onPress={() => onChange(next)}
        />
      </View>
      {isCurrent ? null : <TextAction label="Back to this week" onPress={() => onChange(currentWeekStart)} />}
    </View>
  );
}

type WeekArrowProps = { icon: IconName; label: string; disabled: boolean; onPress: () => void };

// A 44-point arrow button. Faded and not tappable at the ends of the planner's dates.
function WeekArrow({ icon, label, disabled, onPress }: WeekArrowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.arrow, disabled && styles.disabled]}
    >
      <DecorativeIcon name={icon} size={iconSize.lg} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  middle: {
    flex: 1,
    alignItems: "center",
  },
  range: {
    ...typography.heading,
    color: colors.text,
    textAlign: "center",
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
  },
  arrow: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.4,
  },
});
