// The Account tab. Built from small sections; which one shows depends on whether the
// signed-in user's profile is on this device. The tabs are only shown to a signed-in
// user (the auth gate in src/features/account/gate/), so there's no signed-out page here:
// the welcome screen is src/app/(auth)/welcome.tsx.
import { IncompleteAccountSection } from "@/features/account/components/IncompleteAccountSection";
import { SignedInAccount } from "@/features/account/components/SignedInAccount";
import { useAccountProfile } from "@/features/account/useAccountProfile";
import { colors, spacing } from "@/theme";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";

// The main screen for the Account tab. Shows different sections depending on the account status.
export default function AccountScreen() {
  // The signed-in user, and whether their profile is ready. Updates by itself when the
  // profile changes.
  const account = useAccountProfile();

  // Exactly one of these sections shows, depending on account.status. "signed_out" is
  // only the moment between logging out and the welcome screen replacing the tabs, and
  // "needs_username" never reaches the tabs (the gate shows the username step), so both
  // draw nothing.
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* The profile is still being read from the phone. */}
      {account.status === "loading" ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.action} accessibilityLabel="Loading your account" />
        </View>
      ) : null}
      {/* The profile isn't on this phone and couldn't be downloaded (e.g. offline). */}
      {account.status === "unavailable" ? <IncompleteAccountSection onRetry={account.retry} /> : null}
      {/* Everything is ready: the Account menu. */}
      {account.status === "ready" ? <SignedInAccount /> : null}
    </ScrollView>
  );
}

// flexGrow lets the page fill the screen, so the loading spinner sits in the middle.
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxxl,
  },
});
