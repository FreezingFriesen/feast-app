// The root of the app. Every screen is drawn inside this layout.
import { AppProviders } from "@/services/AppProviders";
import { colors, navigationTheme, stackScreenOptions } from "@/theme";
import { Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";

// Keep the splash screen up until AppProviders has finished starting (it hides it).
// Called here, outside any component, so it runs before the splash would hide by itself.
// If either call fails (e.g. on web), the app simply starts without it.
SplashScreen.preventAutoHideAsync().catch(() => {});
// The colour behind every screen, so nothing flashes white or black between them.
SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});

export default function RootLayout() {
  // AppProviders opens the database on the phone and creates the app's services (log in,
  // storage, sync) before any screen appears, then shares them with every screen.
  // ThemeProvider gives the navigators the Feast colours (src/theme/navigation.ts).
  // The only screen in this stack is the tab bar. Its header is hidden because each
  // tab draws its own.
  return (
    <ThemeProvider value={navigationTheme}>
      {/* Dark status bar text, on the cream header. */}
      <StatusBar style="dark" />
      <AppProviders>
        <Stack screenOptions={stackScreenOptions}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </AppProviders>
    </ThemeProvider>
  );
}
