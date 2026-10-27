// The Account tab. Built from small sections; which one shows depends on whether
// someone is signed in and whether their profile is on this device.
import { IncompleteAccountSection } from "@/features/account/components/IncompleteAccountSection";
import { SignedInAccount } from "@/features/account/components/SignedInAccount";
import { SignedOutSection } from "@/features/account/components/SignedOutSection";
import { useAccountProfile } from "@/features/account/useAccountProfile";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";

export default function AccountScreen() {
  const account = useAccountProfile();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {account.status === "signed_out" ? <SignedOutSection /> : null}
      {account.status === "loading" ? (
        <View style={styles.loading}>
          <ActivityIndicator accessibilityLabel="Loading your account" />
        </View>
      ) : null}
      {account.status === "needs_username" ? <IncompleteAccountSection reason="needs_username" /> : null}
      {account.status === "unavailable" ? (
        <IncompleteAccountSection reason="unavailable" onRetry={account.retry} />
      ) : null}
      {account.status === "ready" ? <SignedInAccount user={account.user} profile={account.profile} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingBottom: 48,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
});
