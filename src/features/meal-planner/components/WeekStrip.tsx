import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  addDays,
  dayOfMonth,
  formatDay,
  formatWeekday,
  formatWeekRange,
  weekDays,
  type DateKey,
} from "../dates";

type WeekStripProps = {
  selectedKey: DateKey;
  onSelect: (key: DateKey) => void;
  todayKey?: DateKey;
  // Shows a dot under days that have meals planned.
  hasMeals?: (key: DateKey) => boolean;
};

// ‹ Oct 19 – 25 › with a button for each day of the week containing selectedKey.
// The arrows move the selection by one week, keeping the same weekday.
export function WeekStrip({ selectedKey, onSelect, todayKey, hasMeals }: WeekStripProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => onSelect(addDays(selectedKey, -7))}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          hitSlop={12}
        >
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Text style={styles.range}>{formatWeekRange(selectedKey)}</Text>
        <Pressable
          onPress={() => onSelect(addDays(selectedKey, 7))}
          accessibilityRole="button"
          accessibilityLabel="Next week"
          hitSlop={12}
        >
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>

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
              style={[styles.day, isSelected && styles.daySelected]}
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
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  arrow: {
    fontSize: 28,
    color: "#208AEF",
    paddingHorizontal: 8,
  },
  range: {
    fontSize: 17,
    fontWeight: "600",
  },
  days: {
    flexDirection: "row",
    gap: 4,
  },
  day: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 8,
    gap: 2,
  },
  daySelected: {
    backgroundColor: "#208AEF",
  },
  weekday: {
    fontSize: 12,
    color: "#666",
  },
  dayNumber: {
    fontSize: 17,
    fontWeight: "600",
  },
  today: {
    color: "#208AEF",
  },
  textSelected: {
    color: "#fff",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotFilled: {
    backgroundColor: "#208AEF",
  },
  dotOnSelected: {
    backgroundColor: "#fff",
  },
});
