// The root of the app. Every screen is drawn inside this layout.
import { stackHeader } from "@/components/AppHeader";
import { useAuthRoute } from "@/features/account/gate/AuthGateProvider";
import { AppProviders } from "@/services/AppProviders";
import { colors, navigationTheme, stackScreenOptions } from "@/theme";
import { Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";

// Keep the splash screen up until the auth gate knows which screen to show (it hides
// it), or startup fails (AppProviders hides it). Called here, outside any component, so
// it runs before the splash would hide by itself. If either call fails (e.g. on web),
// the app simply starts without it.
SplashScreen.preventAutoHideAsync().catch(() => {});
// The colour behind every screen, so nothing flashes white or black between them.
SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});

export default function RootLayout() {
  // AppProviders opens the database on the phone and creates the app's services (log in,
  // storage, sync) before any screen appears, then shares them with every screen.
  // ThemeProvider gives the navigators the Feast colours (src/theme/navigation.ts).
  return (
    <ThemeProvider value={navigationTheme}>
      {/* Dark status bar text, on the cream header. */}
      <StatusBar style="dark" />
      <AppProviders>
        <RootNavigator />
      </AppProviders>
    </ThemeProvider>
  );
}

// An account is required (N-14, N-15). The auth gate (src/features/account/gate/)
// decides which group of screens is available, and Stack.Protected removes the others:
// the tabs exist only for a signed-in user whose 30-day session the check has
// confirmed. When the route changes, the screens of the old group leave the history, so
// Back can't return to them, and the first available screen shows (the tabs open on
// Recipes; the welcome group on the welcome screen).
function RootNavigator() {
  const route = useAuthRoute();
  // The first session check hasn't finished: draw nothing, under the splash screen.
  if (route === "splash") return null;
  return (
    <Stack screenOptions={stackScreenOptions}>
      {/* The tab bar. Its header is hidden because each tab draws its own. */}
      <Stack.Protected guard={route === "app"}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack.Protected>
      {/* Welcome, log in, sign up and reset password. */}
      <Stack.Protected guard={route === "welcome"}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      {/* Signed in, but sign up stopped before a username was saved. */}
      <Stack.Protected guard={route === "username"}>
        <Stack.Screen name="choose-username" options={{ title: "Choose a username", header: stackHeader }} />
      </Stack.Protected>
    </Stack>
  );
}
