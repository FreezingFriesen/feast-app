import { Pressable, StyleSheet, Text, View } from "react-native";

type ChipSelectProps<T extends string> = {
  options: readonly T[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  formatLabel?: (value: T) => string;
};

// "keto_friendly" -> "Keto friendly"
export function formatOptionLabel(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

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
            style={[styles.chip, isSelected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
              {formatLabel(option)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  chipSelected: {
    backgroundColor: "#208AEF",
    borderColor: "#208AEF",
  },
  chipText: {
    fontSize: 14,
  },
  chipTextSelected: {
    color: "#fff",
  },
});
