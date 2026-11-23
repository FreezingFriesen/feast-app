import { DecorativeIcon, type IconName } from "@/components/DecorativeIcon";
import { borderWidth, colors, CONTROL_HEIGHT, iconSize, radius, spacing, typography } from "@/theme";
import { Pressable, StyleSheet, Text } from "react-native";

type SocialButtonProps = {
  // "Continue with Google"
  label: string;
  icon: IconName;
  // Read after the label, e.g. "Coming soon. Not available yet."
  accessibilityHint: string;
  onPress: () => void;
};

// A white, full-width button with a provider's logo, as in the welcome mockup. The logo
// is drawn in ink: the providers' own colours aren't in the Feast palette. Ink on white,
// so the label reads on the orange welcome screen.
export function SocialButton({ label, icon, accessibilityHint, onPress }: SocialButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <DecorativeIcon name={icon} size={iconSize.md} color={colors.text} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: CONTROL_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.thin,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
  },
  // A cream fill while pressed, so the press shows without changing the label colour.
  pressed: {
    backgroundColor: colors.chrome,
  },
  label: {
    ...typography.button,
    color: colors.text,
    flexShrink: 1,
  },
});
