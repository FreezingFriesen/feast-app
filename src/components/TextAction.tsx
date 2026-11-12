import { colors, spacing, typography } from "@/theme";
import { Pressable, StyleSheet, Text } from "react-native";

// The text, what happens when it's tapped, and whether it can be tapped right now.
type TextActionProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  // destructive: red, for actions like deleting an account.
  tone?: "default" | "destructive";
  // center (the default) for actions under a form; start to line up with a list.
  align?: "center" | "start";
  // For screen readers, when the label alone isn't enough (e.g. "Remove ingredient 2").
  accessibilityLabel?: string;
};

// A secondary action shown as text, like "Forgot password?" or "+ Add step".
export function TextAction({
  label,
  onPress,
  disabled = false,
  tone = "default",
  align = "center",
  accessibilityLabel,
}: TextActionProps) {
  // hitSlop makes the tappable area 8 points bigger on every side than the text.
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={[styles.action, align === "start" && styles.start]}
    >
      <Text style={[styles.text, tone === "destructive" && styles.destructive, disabled && styles.disabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    alignSelf: "center",
    paddingVertical: spacing.md,
  },
  start: {
    alignSelf: "flex-start",
  },
  text: {
    ...typography.bodyStrong,
    color: colors.action,
  },
  destructive: {
    color: colors.error,
  },
  disabled: {
    opacity: 0.4,
  },
});
