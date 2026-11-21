import { TextAction } from "@/components/TextAction";
import type { ProfileRow } from "@/features/recipes/filter/recipeListState";
import { colors, spacing, typography } from "@/theme";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { LabeledSwitch } from "./LabeledSwitch";

type ProfileFilterRowProps = {
  row: ProfileRow;
  onChange: (on: boolean) => void;
};

// The line about the user's own allergies and diets at the top of the Recipes tab (N-04):
// the switch while they're set, otherwise a link to the next step. An unavailable profile
// shows nothing here; the error message above the list says so and offers Retry.
export function ProfileFilterRow({ row, onChange }: ProfileFilterRowProps) {
  const router = useRouter();
  // withAnchor puts the Account menu under Allergies & Diets, so Back works even when the
  // Account tab hasn't been opened yet.
  const openDietary = () => router.navigate("/account/dietary", { withAnchor: true });
  const openAccount = () => router.navigate("/account");

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
          <TextAction label="Change" align="start" onPress={openDietary} accessibilityLabel="Change your allergies and diets" />
        </View>
      );
    case "not_set":
      return <TextAction label="Set your allergies & diets" align="start" onPress={openDietary} />;
    case "signed_out":
      return <TextAction label="Log in to filter by your allergies & diets" align="start" onPress={openAccount} />;
    case "needs_username":
      return (
        <TextAction
          label="Finish setting up your account to filter by your allergies & diets"
          align="start"
          onPress={openAccount}
        />
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
  inline: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: spacing.md,
  },
});
