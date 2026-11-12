// Account Details, opened from the Account menu: who is signed in (N-13), the 30-day
// session and changing the password (N-15), and the way into deleting the account (N-17).
import { DeleteAccountSection } from "@/features/account/components/DeleteAccountSection";
import { ProfileSection } from "@/features/account/components/ProfileSection";
import { SecuritySection } from "@/features/account/components/SecuritySection";
import { WithReadyProfile } from "@/features/account/components/WithReadyProfile";
import { spacing } from "@/theme";
import { ScrollView, StyleSheet, View } from "react-native";

export default function AccountDetailsScreen() {
  return (
    <WithReadyProfile>
      {(user, profile) => (
        <ScrollView contentContainerStyle={styles.container}>
          <ProfileSection user={user} profile={profile} />
          <SecuritySection />
          {/* Keeps the destructive section apart from the everyday ones. */}
          <View style={styles.spacer} />
          <DeleteAccountSection />
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
  spacer: {
    height: spacing.xxl,
  },
});
