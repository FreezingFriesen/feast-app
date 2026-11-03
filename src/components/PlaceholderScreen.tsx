// src/components/PlaceholderScreen.tsx
import { ScrollView, StyleSheet, Text } from "react-native";

// The heading, and the sentence shown under it.
type PlaceholderScreenProps = {
  title: string;
  description: string;
};

// A title and a short message in the middle of the screen. Used for features that
// aren't built yet (Grocery List), for "not found" screens, and for startup errors.
export function PlaceholderScreen({ title, description }: PlaceholderScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    textAlign: "center",
  },
});
