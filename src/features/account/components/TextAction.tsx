import { Pressable, StyleSheet, Text } from "react-native";

type TextActionProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  // destructive: red, for actions like deleting an account.
  tone?: "default" | "destructive";
};

// A secondary action shown as text, like "Forgot password?" (same style as "+ Add step").
export function TextAction({ label, onPress, disabled = false, tone = "default" }: TextActionProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={styles.action}
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
    paddingVertical: 12,
  },
  text: {
    color: "#208AEF",
    fontSize: 16,
    fontWeight: "600",
  },
  destructive: {
    color: "#c62828",
  },
  disabled: {
    opacity: 0.4,
  },
});
