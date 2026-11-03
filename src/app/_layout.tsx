// The root of the app. Every screen is drawn inside this layout.
import { Stack } from "expo-router";
import { AppProviders } from "@/services/AppProviders";

export default function RootLayout() {
  // AppProviders opens the database on the phone and creates the app's services (log in,
  // storage, sync) before any screen appears, then shares them with every screen.
  // The only screen in this stack is the tab bar. Its header is hidden because each
  // tab draws its own.
  return (
    <AppProviders>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </AppProviders>
  );
}
