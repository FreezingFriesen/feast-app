import { DecorativeIcon } from "@/components/DecorativeIcon";
import { borderWidth, CHIP_HEIGHT, colors, iconSize, MIN_TOUCH_TARGET, radius, spacing, typography } from "@/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";

type ChipSelectProps<T extends string> = {
  // Every chip, in the order shown.
  options: readonly T[];
  // The chips that are highlighted.
  selected: readonly T[];
  // Called with the chip the user tapped.
  onToggle: (value: T) => void;
  // Turns an option into its label. Defaults to formatOptionLabel below.
  formatLabel?: (value: T) => string;
};

// "keto_friendly" -> "Keto friendly"
export function formatOptionLabel(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// A row of tappable chips, one per option, with the selected ones highlighted.
// Tapping a chip calls onToggle; the screen decides what's selected, so it works for
// picking several (diet tags) or exactly one (a unit, a meal slot).
// Selected chips are green and also get a tick, so selection isn't shown by colour alone.
export function ChipSelect<T extends string>({
  options,
  selected,
  onToggle,
  formatLabel = formatOptionLabel,
}: ChipSelectProps<T>) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const isSelected = selected.includes(option);
        return (
          <Pressable
            key={option}
            onPress={() => onToggle(option)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            // hitSlop makes the tappable area 44 points tall.
            hitSlop={(MIN_TOUCH_TARGET - CHIP_HEIGHT) / 2}
            style={[styles.chip, isSelected && styles.chipSelected]}
          >
            {isSelected ? <DecorativeIcon name="checkmark" size={iconSize.sm} color={colors.onAction} /> : null}
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
              {formatLabel(option)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Chips sit in a row and wrap onto the next line when they run out of room.
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: CHIP_HEIGHT,
    borderWidth: borderWidth.thin,
    borderColor: colors.inputBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.action,
    borderColor: colors.action,
  },
  chipText: {
    ...typography.label,
    color: colors.text,
  },
  chipTextSelected: {
    color: colors.onAction,
  },
});
