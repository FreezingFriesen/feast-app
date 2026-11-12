import { formatOptionLabel } from "@/components/form/ChipSelect";
import { colors, MIN_TOUCH_TARGET, radius, shadows, spacing, typography } from "@/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";

type SegmentedControlProps<T extends string> = {
  // The choices, in the order they appear.
  options: readonly T[];
  // The one that is selected now.
  value: T;
  // Called with the option the user tapped.
  onChange: (value: T) => void;
  // Turns an option into its label. Defaults to "keto_friendly" -> "Keto friendly".
  formatLabel?: (value: T) => string;
};

// A row of tabs where exactly one option is selected.
// Used by the meal planner for its Month / Week switch.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  formatLabel = formatOptionLabel,
}: SegmentedControlProps<T>) {
  // The accessibility roles tell screen readers this is a set of tabs, and which is selected.
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {options.map((option) => {
        const isSelected = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            style={[styles.segment, isSelected && styles.segmentSelected]}
          >
            <Text style={[styles.text, isSelected && styles.textSelected]}>
              {formatLabel(option)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// A cream track with the selected tab raised in white, its text bold and green.
const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.chrome,
    borderRadius: radius.md,
    padding: spacing.xxs,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.sm,
  },
  segmentSelected: {
    backgroundColor: colors.surface,
    ...shadows.raised,
  },
  text: {
    ...typography.body,
    color: colors.textMuted,
  },
  textSelected: {
    ...typography.bodyStrong,
    color: colors.action,
  },
});
