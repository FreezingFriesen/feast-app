import { BrandImage } from "@/components/BrandImage";
import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import type { IconName } from "@/components/DecorativeIcon";
import { useLocalDataWiper } from "@/services/ServiceProvider";
import { borderWidth, colors, MIN_TOUCH_TARGET, spacing, typography, welcomeGradient } from "@/theme";
import { useIsFocused, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WELCOME_OFFLINE_MESSAGE } from "../accountMessages";
import { useWelcomeNotice } from "../gate/AuthGateProvider";
import {
  COMING_SOON_HINT,
  createSocialPressHandler,
  SOCIAL_PROVIDERS,
  socialButtonLabel,
  type SocialProvider,
} from "../socialProviders";
import { useOnline } from "../useOnline";
import { SocialButton } from "./SocialButton";

// The wordmark fills this share of the screen width, up to a maximum on tablets.
const WORDMARK_WIDTH_SHARE = 0.8;
const WORDMARK_MAX_WIDTH = 420;
const WORDMARK_ASPECT_RATIO = 1200 / 499;

// Each provider's logo (Ionicons outlines, drawn in ink).
const PROVIDER_ICONS: Record<SocialProvider["id"], IconName> = {
  google: "logo-google",
  facebook: "logo-facebook",
  apple: "logo-apple",
};

// The welcome screen (N-14, N-21), shown whenever nobody is signed in: the app needs an
// account. From the welcome mockup: the Feast logo on green fading into orange, "Sign up
// with email", the social buttons and "Log in".
//
// Differences from the mockup:
// - Green, not a food photo, behind the logo (no licensed photo yet; the orange "F", "t"
//   and tagline would disappear on plain orange).
// - Ink text on orange, not white (white on orange is 2.6:1; ink is 6.28:1).
// - The social logos are ink, not the providers' colours.
export function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Light status bar text while this screen shows, since it's drawn on green.
  const focused = useIsFocused();
  // true or false once known, null while the first check is still running.
  const online = useOnline();
  // Why the user was signed out, or what happened when they logged out or deleted
  // their account. null if there's nothing to say.
  const { notice, showNotice } = useWelcomeNotice();
  const localData = useLocalDataWiper();
  // The last "coming soon" message, after a social button is pressed.
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  // "Try again" after the phone couldn't be cleared.
  const [wiping, setWiping] = useState(false);
  const [wipeError, setWipeError] = useState<string | null>(null);

  const wordmarkWidth = Math.min(width * WORDMARK_WIDTH_SHARE, WORDMARK_MAX_WIDTH);
  // Work in progress: these only show a message (src/features/account/socialProviders.ts).
  const onSocialPress = createSocialPressHandler(setComingSoon);

  // Clears the phone again after a log out or account deletion couldn't.
  async function retryWipe() {
    if (!notice?.retryWipe) return;
    setWiping(true);
    setWipeError(null);
    try {
      await localData.wipe();
      showNotice(notice.kind === "delete_wipe_failed" ? "account_deleted" : null);
    } catch {
      setWipeError("That didn't work either. Try again in a moment.");
    } finally {
      setWiping(false);
    }
  }

  return (
    <View style={styles.screen}>
      {focused ? <StatusBar style="light" /> : null}
      {/* Scrolls when the text is large, so nothing is cut off. */}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <View style={styles.logo}>
          <BrandImage variant="wordmark" height={wordmarkWidth / WORDMARK_ASPECT_RATIO} />
        </View>
        <View style={styles.actions}>
          {notice ? <FormMessage tone={notice.tone} message={notice.message} /> : null}
          {notice?.retryWipe ? (
            <>
              {wipeError ? <FormMessage tone="error" message={wipeError} /> : null}
              <SubmitButton
                label="Try again"
                busyLabel="Removing…"
                busy={wiping}
                variant="secondary"
                onPress={retryWipe}
              />
            </>
          ) : null}
          {online === false ? <FormMessage tone="info" message={WELCOME_OFFLINE_MESSAGE} /> : null}
          <SubmitButton label="Sign up with email" onPress={() => router.push("/sign-up")} />

          {/* "or continue with", between two thin lines. */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>
          {SOCIAL_PROVIDERS.map((provider) => (
            <SocialButton
              key={provider.id}
              label={socialButtonLabel(provider)}
              icon={PROVIDER_ICONS[provider.id]}
              accessibilityHint={COMING_SOON_HINT}
              onPress={() => onSocialPress(provider)}
            />
          ))}
          {comingSoon ? <FormMessage tone="info" message={comingSoon} /> : null}

          {/* Ink, not the mockup's white: white on orange is too faint to read. */}
          <View style={styles.logInRow}>
            <Text style={styles.onWelcomeText}>Already have an account?</Text>
            <Pressable
              testID="log-in-link"
              onPress={() => router.push("/log-in")}
              accessibilityRole="button"
              accessibilityLabel="Log in"
              style={styles.logInLink}
            >
              <Text style={styles.logInLinkText}>Log in</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Green into orange (welcomeGradient). Plain orange where gradients aren't drawn.
  screen: {
    flex: 1,
    backgroundColor: colors.welcomeFallback,
    experimental_backgroundImage: welcomeGradient,
  },
  content: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
  },
  logo: {
    alignItems: "center",
  },
  actions: {
    paddingTop: spacing.xxl,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  dividerLine: {
    flex: 1,
    height: borderWidth.thin,
    backgroundColor: colors.onWelcome,
  },
  dividerText: {
    ...typography.caption,
    color: colors.onWelcome,
  },
  logInRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  onWelcomeText: {
    ...typography.body,
    color: colors.onWelcome,
  },
  logInLink: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  logInLinkText: {
    ...typography.bodyStrong,
    color: colors.onWelcome,
    textDecorationLine: "underline",
  },
});
