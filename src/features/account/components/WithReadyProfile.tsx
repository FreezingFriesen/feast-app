import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import type { Profile } from "@/repositories/ProfileRepository";
import type { AuthUser } from "@/services/auth/AuthService";
import { colors, spacing } from "@/theme";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAccountProfile } from "../useAccountProfile";
import { AccountFormScreen } from "./AccountFormScreen";

type WithReadyProfileProps = {
  // Draws the screen once the signed-in user and their profile are on the phone.
  children: (user: AuthUser, profile: Profile) => ReactNode;
};

// For the Account screens opened from the menu (Account Details, Allergies & Diets).
// They need the profile, which may still be loading or not on this phone yet, so this
// shows what to do instead until the profile is ready.
export function WithReadyProfile({ children }: WithReadyProfileProps) {
  const router = useRouter();
  const account = useAccountProfile();

  if (account.status === "ready") {
    return children(account.user, account.profile);
  }
  if (account.status === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.action} accessibilityLabel="Loading your account" />
      </View>
    );
  }
  // The auth gate only shows the tabs to a signed-in user, so this is only the moment
  // between logging out and the welcome screen replacing the tabs.
  if (account.status === "signed_out") return null;
  // The profile isn't on this phone: the Account page explains why and offers to try
  // again. (An account with no username never reaches the tabs: the gate shows the
  // username step instead.)
  return (
    <AccountFormScreen>
      <FormMessage tone="info" message="Your account isn't ready on this phone yet." />
      <SubmitButton label="Go to your account" onPress={() => router.dismissTo("/account")} />
    </AccountFormScreen>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxxl,
  },
});
