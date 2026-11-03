import { formatOptionLabel } from "@/components/form/ChipSelect";
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

// A grey track with the selected tab raised in white (shadow on iOS, elevation on Android).
const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "#eef0f3",
    borderRadius: 8,
    padding: 2,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 6,
  },
  segmentSelected: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  text: {
    fontSize: 15,
    color: "#555",
  },
  textSelected: {
    color: "#000",
    fontWeight: "600",
  },
});
