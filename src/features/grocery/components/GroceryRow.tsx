import { DecorativeIcon } from "@/components/DecorativeIcon";
import { borderWidth, colors, iconSize, MIN_TOUCH_TARGET, spacing, typography } from "@/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";

type GroceryRowProps = {
  name: string;
  // The amount as shown ("500 g"), or "" when there is none.
  amount: string;
  // What a screen reader says for the row (name, amount in words, any note).
  accessibilityLabel: string;
  checked: boolean;
  onToggle: () => void;
  // A short note under the name, e.g. that the line couldn't be combined with another.
  caption?: string;
  // Shown as a remove button (manual items only).
  onRemove?: () => void;
};

// One line of the grocery list: a checkbox with the name and amount. Tapping anywhere on
// it checks it off. Checked rows show a ticked box (not only a colour change) and muted,
// struck-through text.
export function GroceryRow({ name, amount, accessibilityLabel, checked, onToggle, caption, onRemove }: GroceryRowProps) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={accessibilityLabel}
        style={styles.main}
      >
        <DecorativeIcon
          name={checked ? "checkbox" : "square-outline"}
          size={iconSize.lg}
          color={checked ? colors.action : colors.inputBorder}
        />
        {/* Takes the room the amount doesn't, so long names wrap instead of pushing it off. */}
        <View style={styles.text}>
          <Text style={[styles.name, checked && styles.checkedText]}>{name}</Text>
          {caption ? <Text style={styles.caption}>{caption}</Text> : null}
        </View>
        {amount ? <Text style={[styles.amount, checked && styles.checkedText]}>{amount}</Text> : null}
      </Pressable>
      {onRemove ? (
        <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${name}`} style={styles.remove}>
          <DecorativeIcon name="close" size={iconSize.md} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

// Rows are divided by a thin line, with no shadows, so long lists scroll smoothly.
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: borderWidth.thin,
    borderBottomColor: colors.border,
  },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.md,
  },
  text: {
    flex: 1,
  },
  name: {
    ...typography.body,
    color: colors.text,
  },
  amount: {
    ...typography.bodyStrong,
    color: colors.text,
    flexShrink: 0,
  },
  checkedText: {
    color: colors.textMuted,
    textDecorationLine: "line-through",
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
  remove: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -spacing.sm,
  },
});
