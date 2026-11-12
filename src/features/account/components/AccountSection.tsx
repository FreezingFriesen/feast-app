import { borderWidth, colors, radius, spacing, typography } from "@/theme";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

type AccountSectionProps = {
  title: string;
  // Whatever goes inside the card, under the title.
  children: ReactNode;
};

// One titled card on the Account pages: a white card with a green heading.
export function AccountSection({ title, children }: AccountSectionProps) {
  // The title is marked as a heading, so screen reader users can jump between sections.
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
    borderWidth: borderWidth.thin,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
  },
  title: {
    ...typography.groupHeading,
    color: colors.action,
    marginBottom: spacing.sm,
  },
});
