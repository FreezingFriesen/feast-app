import { StyleSheet, Text, View } from "react-native";

type FormMessageProps = {
  tone: "error" | "info" | "success";
  message: string;
};

// A message above or below a form. Screen readers announce it when it appears.
export function FormMessage({ tone, message }: FormMessageProps) {
  return (
    <View
      style={[styles.box, boxStyles[tone]]}
      accessibilityRole={tone === "error" ? "alert" : undefined}
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.text, textStyles[tone]]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginVertical: 8,
  },
  text: {
    fontSize: 15,
  },
});

const boxStyles = StyleSheet.create({
  error: { borderColor: "#c62828", backgroundColor: "#fdecea" },
  info: { borderColor: "#208AEF", backgroundColor: "#e8f3fd" },
  success: { borderColor: "#2e7d32", backgroundColor: "#e8f5e9" },
});

const textStyles = StyleSheet.create({
  error: { color: "#8e1c1c" },
  info: { color: "#0b4f8a" },
  success: { color: "#1b5e20" },
});
