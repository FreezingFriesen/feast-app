import { Stack } from "expo-router";

// This layout is shared across all the routes defined in the /account directory.
export default function AccountLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Account" }} />
      <Stack.Screen name="log-in" options={{ title: "Log in" }} />
      <Stack.Screen name="sign-up" options={{ title: "Create account" }} />
      <Stack.Screen name="forgot-password" options={{ title: "Reset password" }} />
      <Stack.Screen name="choose-username" options={{ title: "Choose a username" }} />
      <Stack.Screen name="change-password" options={{ title: "Change password" }} />
      <Stack.Screen name="delete-account" options={{ title: "Delete account" }} />
    </Stack>
  );
}
