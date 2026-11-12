import { colors, iconSize, radius, spacing, tileSize, typography } from "@/theme";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { DecorativeIcon, type IconName } from "./DecorativeIcon";

type EmptyStateProps = {
  // Shown in a cream tile above the title.
  icon?: IconName;
  title: string;
  description: string;
  // An optional action under the text, e.g. a "Create a recipe" button.
  children?: ReactNode;
};

// What a list shows when there's nothing in it yet: an icon, a title, a sentence and
// an optional button, centred in the space.
export function EmptyState({ icon, title, description, children }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon ? (
        <View style={styles.tile}>
          <DecorativeIcon name={icon} size={iconSize.xl} color={colors.action} />
        </View>
      ) : null}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.description}>{description}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  tile: {
    width: tileSize.lg,
    height: tileSize.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.chrome,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  // alignSelf: stretch lets long text wrap instead of running off the screen (web).
  title: {
    ...typography.heading,
    alignSelf: "stretch",
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  description: {
    ...typography.body,
    alignSelf: "stretch",
    color: colors.textMuted,
    textAlign: "center",
  },
});
