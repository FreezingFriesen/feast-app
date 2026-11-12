import { colors, MIN_TOUCH_TARGET, spacing, typography } from "@/theme";
import { Pressable, StyleSheet, Text, type PressableProps } from "react-native";

// Everything a Pressable accepts (so it works inside <Link asChild>), plus the text.
type HeaderTextButtonProps = PressableProps & {
  label: string;
};

// A text button in the header bar, like "+ New" or "Today". Green on the cream header,
// with a 44-point tap area.
export function HeaderTextButton({ label, accessibilityLabel, ...pressableProps }: HeaderTextButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      {...pressableProps}
      accessibilityLabel={accessibilityLabel ?? label}
      style={styles.button}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  text: {
    ...typography.bodyStrong,
    color: colors.action,
  },
});
