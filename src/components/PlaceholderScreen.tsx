// src/components/PlaceholderScreen.tsx
import { colors, spacing, typography } from "@/theme";
import { ScrollView, StyleSheet, Text } from "react-native";

// The heading, and the sentence shown under it.
type PlaceholderScreenProps = {
  title: string;
  description: string;
};

// A title and a short message in the middle of the screen. Used for "not found"
// screens, and for startup errors. Because it is also the startup-error screen, it uses
// only plain text and the theme constants: no icons, images or fonts that could fail.
export function PlaceholderScreen({ title, description }: PlaceholderScreenProps) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
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
