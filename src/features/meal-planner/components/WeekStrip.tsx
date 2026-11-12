import { DecorativeIcon } from "@/components/DecorativeIcon";
import { borderWidth, colors, DOT_SIZE, iconSize, MIN_TOUCH_TARGET, radius, spacing, typography } from "@/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  addDays,
  dayOfMonth,
  formatDay,
  formatMonthYear,
  formatWeekday,
  weekDays,
  type DateKey,
} from "../dates";

type WeekStripProps = {
  // The highlighted day. The strip shows the week it falls in.
  selectedKey: DateKey;
  // A day or an arrow was tapped. Gets the newly selected day.
  onSelect: (key: DateKey) => void;
  // Today's number is green, with a green outline round its card.
  todayKey?: DateKey;
  // Shows a dot under days that have meals planned.
  hasMeals?: (key: DateKey) => boolean;
};

// OCTOBER 2026 ‹ › over a card for each day of the week containing selectedKey,
// Monday to Sunday, as in the meal planner mockup.
// The arrows move the selection by one week, keeping the same weekday.
export function WeekStrip({ selectedKey, onSelect, todayKey, hasMeals }: WeekStripProps) {
  return (
    <View style={styles.container}>
      {/* The top line: the selected day's month, then the previous- and next-week arrows. */}
      <View style={styles.header}>
        <Text style={styles.month}>{formatMonthYear(selectedKey)}</Text>
        <View style={styles.arrows}>
          <Pressable
            onPress={() => onSelect(addDays(selectedKey, -7))}
            accessibilityRole="button"
            accessibilityLabel="Previous week"
            style={styles.arrow}
          >
            <DecorativeIcon name="chevron-back" size={iconSize.lg} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => onSelect(addDays(selectedKey, 7))}
            accessibilityRole="button"
            accessibilityLabel="Next week"
            style={styles.arrow}
          >
            <DecorativeIcon name="chevron-forward" size={iconSize.lg} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Seven cards, Monday to Sunday: the weekday, the day number, and a dot if meals
          are planned. The selected day is filled green. */}
      <View style={styles.days}>
        {weekDays(selectedKey).map((key) => {
          const isSelected = key === selectedKey;
          const isToday = key === todayKey;
          return (
            <Pressable
              key={key}
              onPress={() => onSelect(key)}
              accessibilityRole="button"
              accessibilityLabel={formatDay(key)}
              accessibilityState={{ selected: isSelected }}
              style={[styles.day, isToday && styles.dayToday, isSelected && styles.daySelected]}
            >
              <Text style={[styles.weekday, isSelected && styles.textSelected]}>
                {formatWeekday(key)}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  isToday && styles.today,
                  isSelected && styles.textSelected,
                ]}
              >
                {dayOfMonth(key)}
              </Text>
              {/* The dot is always there (so the cards stay the same height) but is
                  only coloured when the day has meals. Cream on the selected day. */}
              <View
                style={[
                  styles.dot,
                  hasMeals?.(key) && (isSelected ? styles.dotOnSelected : styles.dotFilled),
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  days: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  // A cream card. The edge is the card's own colour, so the today outline doesn't
  // change its size.
  day: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.thick,
    borderColor: colors.chrome,
    backgroundColor: colors.chrome,
    gap: spacing.xxs,
  },
  dayToday: {
    borderColor: colors.action,
  },
  daySelected: {
    backgroundColor: colors.action,
    borderColor: colors.action,
  },
  weekday: {
    ...typography.small,
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  dayNumber: {
    ...typography.number,
    color: colors.text,
  },
  today: {
    color: colors.action,
  },
  textSelected: {
    color: colors.onAction,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  dotFilled: {
    backgroundColor: colors.action,
  },
  dotOnSelected: {
    backgroundColor: colors.onAction,
  },
});
