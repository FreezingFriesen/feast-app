// The Account tab. Built from small sections; which one shows depends on whether
// someone is signed in and whether their profile is on this device.
import { IncompleteAccountSection } from "@/features/account/components/IncompleteAccountSection";
import { SignedInAccount } from "@/features/account/components/SignedInAccount";
import { SignedOutSection } from "@/features/account/components/SignedOutSection";
import { useAccountProfile } from "@/features/account/useAccountProfile";
import { colors, spacing } from "@/theme";
import { Stack } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";

// The main screen for the Account tab. Shows different sections depending on the account status.
export default function AccountScreen() {
  // Who is signed in, and whether their profile is ready. Updates by itself when the
  // user logs in or out, or the profile changes.
  const account = useAccountProfile();
  const signedOut = account.status === "signed_out";

  // Exactly one of these sections shows, depending on account.status.
  return (
    <>
      {/* The signed-out welcome screen fills the page, so the header is hidden then. */}
      <Stack.Screen options={{ headerShown: !signedOut }} />
      <ScrollView contentContainerStyle={[styles.container, signedOut && styles.welcome]}>
        {/* Nobody is signed in: the welcome screen, to sign up or log in. */}
        {signedOut ? <SignedOutSection /> : null}
        {/* Signed in, and the profile is still being read from the phone. */}
        {account.status === "loading" ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.action} accessibilityLabel="Loading your account" />
          </View>
        ) : null}
        {/* Signed in, but sign up stopped before a username was saved. */}
        {account.status === "needs_username" ? <IncompleteAccountSection reason="needs_username" /> : null}
        {/* The profile isn't on this phone and couldn't be downloaded (e.g. offline). */}
        {account.status === "unavailable" ? (
          <IncompleteAccountSection reason="unavailable" onRetry={account.retry} />
        ) : null}
        {/* Everything is ready: the Account menu. */}
        {account.status === "ready" ? <SignedInAccount /> : null}
      </ScrollView>
    </>
  );
}

// flexGrow lets the page fill the screen, so the loading spinner sits in the middle
// and the welcome screen reaches the bottom.
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl,
  },
  welcome: {
    paddingBottom: 0,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxxl,
  },
});
