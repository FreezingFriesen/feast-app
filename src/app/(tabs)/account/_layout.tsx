import { stackHeader } from "@/components/AppHeader";
import { stackScreenOptions } from "@/theme";
import { Stack } from "expo-router";

// The Account menu sits under any Account screen opened from another tab (e.g. Allergies
// & Diets from the Recipes tab's "Set your allergies & diets", with { withAnchor: true }),
// so Back returns to the menu instead of leaving the user stuck.
export const unstable_settings = { anchor: "index" };

// This layout is shared across all the routes defined in the /account directory.
// The screens stack on top of each other as the user moves between them, and the back
// button returns to the one underneath. Each line sets the header title for one screen;
// "name" is the screen's file name (log-in.tsx -> "log-in"). Every screen uses the
// Feast header (AppHeader).
export default function AccountLayout() {
  return (
    <Stack screenOptions={{ ...stackScreenOptions, header: stackHeader }}>
      <Stack.Screen name="index" options={{ title: "My Account" }} />
      <Stack.Screen name="details" options={{ title: "Account Details" }} />
      <Stack.Screen name="dietary" options={{ title: "Allergies & Diets" }} />
      <Stack.Screen name="change-password" options={{ title: "Change password" }} />
      <Stack.Screen name="delete-account" options={{ title: "Delete account" }} />
    </Stack>
  );
}
