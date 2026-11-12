// Theme and shared options for the navigators (headers, tab bar, screen backgrounds).
// The header itself is drawn by src/components/AppHeader.tsx; layouts add it with
// `header: stackHeader` next to these options.
import { DefaultTheme, type NativeStackNavigationOptions, type Theme } from "expo-router";
import type { BottomTabNavigationOptions } from "expo-router/js-tabs";
import { colors } from "./colors";
import { radius, shadows } from "./layout";
import { typography } from "./typography";

// React Navigation's own colours, used for anything we don't style ourselves
// (e.g. the background behind a screen while it slides in).
export const navigationTheme: Theme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    primary: colors.action,
    background: colors.background,
    card: colors.headerBackground,
    text: colors.text,
    border: colors.border,
    notification: colors.error,
  },
};

// For every Stack. contentStyle colours the screen behind its content, so sheets and
// modals don't flash grey. The header settings style the native header that modals keep.
export const stackScreenOptions: NativeStackNavigationOptions = Object.freeze({
  contentStyle: { backgroundColor: colors.background },
  headerStyle: { backgroundColor: colors.headerBackground },
  headerTintColor: colors.headerTint,
  headerTitleStyle: { ...typography.title, color: colors.headerText },
  headerTitleAlign: "center",
  headerShadowVisible: false,
});

// Modals keep the native header: a custom header inside an iOS sheet gets the wrong
// safe-area spacing. Setting header to undefined undoes the layout's AppHeader.
export const modalScreenOptions: NativeStackNavigationOptions = Object.freeze({
  presentation: "modal",
  header: undefined,
});

// For the tab bar: white with rounded top corners and a soft shadow, as in the mockups.
// The labels are drawn by the tabs layout (bold when selected) using typography.tabLabel.
export const tabScreenOptions: BottomTabNavigationOptions = Object.freeze({
  tabBarActiveTintColor: colors.tabActive,
  tabBarInactiveTintColor: colors.tabInactive,
  tabBarStyle: {
    backgroundColor: colors.tabBar,
    borderTopWidth: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadows.tabBar,
  },
  sceneStyle: { backgroundColor: colors.background },
});
