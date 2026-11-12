import { EmptyState } from "@/components/EmptyState";
import { ScrollView, StyleSheet } from "react-native";

// The Grocery List tab (#6). It isn't built yet, so for now it shows an empty state.
// The list will be worked out from the meal plan, not stored. The mockup's items,
// checkboxes and "+ Add Ingredient" wait for #6 and N-07 to N-11 (see
// docs/DESIGN_SYSTEM.md, Not implemented).
export default function GroceryListScreen() {
  // Scrolls so the text still fits at large text sizes.
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <EmptyState
        icon="basket-outline"
        title="Nothing on your list yet"
        description="Your weekly grocery list will appear here."
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
  },
});
