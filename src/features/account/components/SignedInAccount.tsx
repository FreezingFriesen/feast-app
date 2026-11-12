import { colors, spacing, typography } from "@/theme";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { AccountMenuRow } from "./AccountMenuRow";
import { LogOutButton } from "./LogOutButton";
import { SyncSection } from "./SyncSection";

// The Account page for a signed-in user, as in the mockup: a menu of the Account
// screens, then sync status and log out. Top to bottom:
// - Account & Settings: Account Details (profile, sign-in and security, delete account)
// - Food Preferences: Allergies & Diets (dietary restrictions, N-18)
// - Sync (stays here, so "Offline" and "N changes waiting" show on the Account page)
// - Log out
export function SignedInAccount() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.group} accessibilityRole="header">
        Account & Settings
      </Text>
      <AccountMenuRow
        icon="person-outline"
        title="Account Details"
        caption="Manage"
        onPress={() => router.push("/account/details")}
      />

      <Text style={styles.group} accessibilityRole="header">
        Food Preferences
      </Text>
      <AccountMenuRow
        icon="nutrition-outline"
        title="Allergies & Diets"
        caption="Manage"
        onPress={() => router.push("/account/dietary")}
      />

      <View style={styles.spacer} />
      <SyncSection />
      <LogOutButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  group: {
    ...typography.groupHeading,
    color: colors.action,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  spacer: {
    height: spacing.xl,
  },
});
