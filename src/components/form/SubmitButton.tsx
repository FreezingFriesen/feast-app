import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

type SubmitButtonProps = {
  label: string;
  // Shown while busy, e.g. "Logging in…"
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  // destructive: for actions that can't be undone, like deleting an account.
  variant?: "primary" | "secondary" | "destructive";
  onPress: () => void;
};

// A form's main action, in the same style as the recipe form's save button.
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
  const secondary = variant === "secondary";
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      style={[
        styles.button,
        secondary && styles.secondary,
        variant === "destructive" && styles.destructive,
        inactive && styles.inactive,
      ]}
    >
      <View style={styles.content}>
        {busy ? <ActivityIndicator color={secondary ? "#208AEF" : "#fff"} /> : null}
        <Text style={[styles.text, secondary && styles.secondaryText]}>{busy && busyLabel ? busyLabel : label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#208AEF",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  secondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#208AEF",
  },
  destructive: {
    backgroundColor: "#c62828",
  },
  inactive: {
    opacity: 0.6,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  text: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryText: {
    color: "#208AEF",
  },
});
