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
// They need the profile, but can also be opened from a link while signed out, so this
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
  // Nobody is signed in (e.g. the session ran out): ask them to log in first.
  if (account.status === "signed_out") {
    return (
      <AccountFormScreen>
        <FormMessage tone="info" message="Log in to see your account." />
        <SubmitButton label="Log in" onPress={() => router.replace("/account/log-in")} />
      </AccountFormScreen>
    );
  }
  // No username yet, or the profile isn't on this phone: the Account page explains why
  // and offers the next step.
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
