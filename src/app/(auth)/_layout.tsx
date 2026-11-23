import { stackHeader } from "@/components/AppHeader";
import { stackScreenOptions } from "@/theme";
import { Stack } from "expo-router";

// The welcome screen sits under log in, sign up and reset password, even when one of
// them is opened from a link, so Back always returns to it.
export const unstable_settings = { anchor: "welcome" };

// The signed-out screens (N-13, N-14, N-16). The root layout only makes this group
// available while nobody is signed in (the auth gate, src/features/account/gate/).
// The welcome screen fills the page, so it has no header; the forms use the Feast
// header (AppHeader).
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ ...stackScreenOptions, header: stackHeader }}>
      <Stack.Screen name="welcome" options={{ title: "Welcome", headerShown: false }} />
      <Stack.Screen name="log-in" options={{ title: "Log in" }} />
      <Stack.Screen name="sign-up" options={{ title: "Create account" }} />
      <Stack.Screen name="forgot-password" options={{ title: "Reset password" }} />
    </Stack>
  );
}
