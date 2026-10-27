import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

type AccountSectionProps = {
  title: string;
  children: ReactNode;
};

// One titled card on the Account page (same card style as the recipe form).
export function AccountSection({ title, children }: AccountSectionProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
});
