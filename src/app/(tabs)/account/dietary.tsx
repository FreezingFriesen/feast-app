// Allergies & Diets, opened from the Account menu: the user's dietary restrictions
// (N-18), saved on this phone first so it works offline.
import { DietaryRestrictionsSection } from "@/features/account/components/DietaryRestrictionsSection";
import { WithReadyProfile } from "@/features/account/components/WithReadyProfile";
import { spacing } from "@/theme";
import { ScrollView, StyleSheet } from "react-native";

export default function DietaryScreen() {
  return (
    <WithReadyProfile>
      {(_user, profile) => (
        <ScrollView contentContainerStyle={styles.container}>
          <DietaryRestrictionsSection profile={profile} />
        </ScrollView>
      )}
    </WithReadyProfile>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
});
