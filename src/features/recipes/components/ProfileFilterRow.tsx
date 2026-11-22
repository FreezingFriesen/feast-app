import { TextAction } from "@/components/TextAction";
import type { ProfileRow } from "@/features/recipes/filter/recipeListState";
import { colors, spacing, typography } from "@/theme";
import { StyleSheet, Text, View } from "react-native";
import { LabeledSwitch } from "./LabeledSwitch";

// Where the next-step links go (Allergies & Diets, or the Account page).
export type ProfileFilterLinks = { openDietary: () => void; openAccount: () => void };

type ProfileFilterRowProps = {
  row: ProfileRow;
  onChange: (on: boolean) => void;
  // Left out inside a modal (the meal planner's recipe picker), where switching tabs isn't
  // reliable: the row then says where to go instead of linking there.
  links?: ProfileFilterLinks;
};

// The line about the user's own allergies and diets (N-04): the switch while they're set,
// otherwise the next step. An unavailable profile shows nothing here; the error message
// says so and offers Retry.
export function ProfileFilterRow({ row, onChange, links }: ProfileFilterRowProps) {
  // A next step: a link when there are links, otherwise a sentence saying where to go.
  const nextStep = (linkLabel: string, sentence: string, open: (() => void) | undefined) =>
    open ? <TextAction label={linkLabel} align="start" onPress={open} /> : <Text style={styles.guidance}>{sentence}</Text>;

  switch (row.kind) {
    case "filter":
      return (
        <View>
          <Text style={styles.summary}>{row.text}</Text>
          <LabeledSwitch
            label="Filter by my allergies & diets"
            accessibilityLabel="Filter by my allergies and diets"
            value={row.on}
            onValueChange={onChange}
          />
        </View>
      );
    case "none":
      return (
        <View style={styles.inline}>
          <Text style={styles.summary}>Your allergies & diets: None</Text>
          {links ? (
            <TextAction
              label="Change"
              align="start"
              onPress={links.openDietary}
              accessibilityLabel="Change your allergies and diets"
            />
          ) : null}
        </View>
      );
    case "not_set":
      return nextStep(
        "Set your allergies & diets",
        "Set your allergies & diets on the Account page to filter recipes by them.",
        links?.openDietary,
      );
    case "signed_out":
      return nextStep(
        "Log in to filter by your allergies & diets",
        "Log in on the Account page to filter by your allergies & diets.",
        links?.openAccount,
      );
    case "needs_username":
      return nextStep(
        "Finish setting up your account to filter by your allergies & diets",
        "Finish setting up your account on the Account page to filter by your allergies & diets.",
        links?.openAccount,
      );
    case "unavailable":
      return null;
  }
}

const styles = StyleSheet.create({
  summary: {
    ...typography.body,
    color: colors.text,
  },
  guidance: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.xs,
  },
  inline: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: spacing.md,
  },
});
