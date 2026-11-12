import { borderWidth, colors, CONTROL_HEIGHT, radius, spacing, typography } from "@/theme";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

type Variant = "primary" | "secondary" | "destructive";

type SubmitButtonProps = {
  label: string;
  // Shown while busy, e.g. "Logging in…"
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  // destructive: for actions that can't be undone, like deleting an account.
  variant?: Variant;
  onPress: () => void;
};

// A form's main action. primary is filled green, secondary is outlined green, and
// destructive is red (kept apart from the brand colours on purpose).
// Disabled while busy so it can't be pressed twice.
export function SubmitButton({
  label,
  busyLabel,
  busy = false,
  disabled = false,
  variant = "primary",
  onPress,
}: SubmitButtonProps) {
  const inactive = busy || disabled;
  const textColor = TEXT_COLORS[variant];
  // The button can't be pressed while busy or disabled, and fades out to show that.
  // It darkens while pressed.
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        styles.button,
        buttonStyles[variant],
        pressed && pressedStyles[variant],
        inactive && styles.inactive,
      ]}
    >
      {/* While busy: a spinner, and busyLabel (e.g. "Logging in…") instead of the label. */}
      <View style={styles.content}>
        {busy ? <ActivityIndicator color={textColor} /> : null}
        <Text style={[styles.text, { color: textColor }]}>{busy && busyLabel ? busyLabel : label}</Text>
      </View>
    </Pressable>
  );
}

const TEXT_COLORS: Record<Variant, string> = {
  primary: colors.onAction,
  secondary: colors.action,
  destructive: colors.onDestructive,
};

const styles = StyleSheet.create({
  button: {
    minHeight: CONTROL_HEIGHT,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  inactive: {
    opacity: 0.6,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  text: {
    ...typography.button,
  },
});

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: colors.action },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: borderWidth.thick,
    borderColor: colors.action,
  },
  destructive: { backgroundColor: colors.error },
});

const pressedStyles = StyleSheet.create({
  primary: { backgroundColor: colors.actionPressed },
  secondary: { backgroundColor: colors.selectedTint },
  destructive: { backgroundColor: colors.errorText },
});
