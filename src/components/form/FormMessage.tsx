import { DecorativeIcon, type IconName } from "@/components/DecorativeIcon";
import { borderWidth, colors, iconSize, radius, spacing, typography } from "@/theme";
import { StyleSheet, Text, View } from "react-native";

type Tone = "error" | "info" | "success";

type FormMessageProps = {
  // error = red, info = yellow, success = green. Each also has its own icon, so the
  // tone isn't shown by colour alone.
  tone: Tone;
  message: string;
};

// A message above or below a form. Screen readers announce it when it appears.
// Errors are marked as alerts so they are read out straight away.
export function FormMessage({ tone, message }: FormMessageProps) {
  const look = TONES[tone];
  return (
    <View
      style={[styles.box, look.box]}
      accessibilityRole={tone === "error" ? "alert" : undefined}
      accessibilityLiveRegion="polite"
    >
      <DecorativeIcon name={look.icon} size={iconSize.md} color={look.color} />
      <Text style={[styles.text, { color: look.color }]}>{message}</Text>
    </View>
  );
}

// The icon, edge, background and text colour for each tone.
const TONES: Record<Tone, { icon: IconName; color: string; box: { borderColor: string; backgroundColor: string } }> = {
  error: {
    icon: "alert-circle-outline",
    color: colors.errorText,
    box: { borderColor: colors.error, backgroundColor: colors.errorBackground },
  },
  info: {
    icon: "information-circle-outline",
    color: colors.text,
    box: { borderColor: colors.info, backgroundColor: colors.infoBackground },
  },
  success: {
    icon: "checkmark-circle-outline",
    color: colors.success,
    box: { borderColor: colors.success, backgroundColor: colors.successBackground },
  },
};

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.thin,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  text: {
    ...typography.body,
    flex: 1,
  },
});
