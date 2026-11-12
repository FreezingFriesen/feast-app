import { BrandImage } from "@/components/BrandImage";
import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { colors, MIN_TOUCH_TARGET, spacing, typography, welcomeGradient } from "@/theme";
import { useIsFocused, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sessionEndedMessage } from "../accountMessages";
import { useSessionStatus } from "../SessionStatusProvider";

// The wordmark's height on a normal phone. It shrinks on narrow screens to fit.
const WORDMARK_HEIGHT = 130;
const WORDMARK_ASPECT_RATIO = 1200 / 499;

// The Account tab when nobody is signed in: the welcome screen from the mockup. The
// Feast logo on green, fading into orange, with "Sign up with email" and a "Log in" link.
// It fills the page (the Account screen hides its header while signed out).
export function SignedOutSection() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Light status bar text while this screen shows, since it's drawn on green.
  const focused = useIsFocused();
  // If the user was just signed out (e.g. after 30 days), a note explaining why.
  // null otherwise.
  const ended = sessionEndedMessage(useSessionStatus());
  const wordmarkHeight = Math.min(WORDMARK_HEIGHT, (width - 2 * spacing.xl) / WORDMARK_ASPECT_RATIO);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xxl }]}>
      {focused ? <StatusBar style="light" /> : null}
      <View style={styles.logo}>
        <BrandImage variant="wordmark" height={wordmarkHeight} />
      </View>
      <View style={styles.actions}>
        {ended ? <FormMessage tone="info" message={ended} /> : null}
        <Text style={styles.description}>
          Log in to back up your recipes and meal plans and use them on your other devices.
        </Text>
        <SubmitButton label="Sign up with email" onPress={() => router.push("/account/sign-up")} />
        {/* Ink, not the mockup's white: white on orange is too faint to read. */}
        <View style={styles.logInRow}>
          <Text style={styles.logInText}>Already have an account?</Text>
          <Pressable
            onPress={() => router.push("/account/log-in")}
            accessibilityRole="button"
            accessibilityLabel="Log in"
            style={styles.logInLink}
          >
            <Text style={styles.logInLinkText}>Log in</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Green into orange (welcomeGradient). Plain orange where gradients aren't drawn.
  screen: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.welcomeFallback,
    experimental_backgroundImage: welcomeGradient,
  },
  logo: {
    alignItems: "center",
  },
  actions: {
    paddingTop: spacing.xxl,
  },
  description: {
    ...typography.body,
    color: colors.onWelcome,
    textAlign: "center",
  },
  logInRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  logInText: {
    ...typography.body,
    color: colors.onWelcome,
  },
  logInLink: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
  },
  logInLinkText: {
    ...typography.bodyStrong,
    color: colors.onWelcome,
    textDecorationLine: "underline",
  },
});
