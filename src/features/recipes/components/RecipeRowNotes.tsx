import { DecorativeIcon, type IconName } from "@/components/DecorativeIcon";
import type { RecipeRowView } from "@/features/recipes/filter/recipeListState";
import { colors, iconSize, spacing, typography } from "@/theme";
import { StyleSheet, Text, View } from "react-native";

type Note = RecipeRowView["notes"][number];

// Each kind of note has its own icon and text, so it never relies on colour alone, and
// nothing is green or ticked: the absence of a warning is the only positive signal.
const LOOK: Record<Note["kind"], { icon: IconName; color: string }> = {
  contains: { icon: "warning-outline", color: colors.errorText },
  conflict: { icon: "alert-circle-outline", color: colors.errorText },
  unchecked: { icon: "help-circle-outline", color: colors.text },
};

// The allergen and diet notes under a recipe in the list (#10, N-04): "Contains: Milk",
// "Tagged Vegan, but contains Milk", "Couldn't check: Hoisin sauce".
export function RecipeRowNotes({ notes }: { notes: readonly Note[] }) {
  if (notes.length === 0) return null;
  return (
    <View style={styles.notes}>
      {notes.map((note) => {
        const look = LOOK[note.kind];
        return (
          <View key={note.kind + note.text} style={styles.note}>
            <DecorativeIcon name={look.icon} size={iconSize.sm} color={look.color} style={styles.icon} />
            <Text style={[styles.text, { color: look.color }]}>{note.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  notes: {
    marginTop: spacing.xs,
    gap: spacing.xxs,
  },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  // Lines the icon up with the first line of text.
  icon: {
    marginTop: spacing.xxs,
  },
  text: {
    ...typography.caption,
    flex: 1,
  },
});
