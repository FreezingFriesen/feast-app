import { colors, iconSize, MIN_TOUCH_TARGET, radius, shadows, spacing, typography } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { NativeStackHeaderProps } from "expo-router";
import type { BottomTabHeaderProps } from "expo-router/js-tabs";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandImage } from "./BrandImage";

type AppHeaderProps = {
  title: string;
  // Shown as a back arrow when there's a screen to go back to.
  onBack?: () => void;
  // The screen's own header button, e.g. "+ New".
  right?: ReactNode;
};

// The header bar from the mockups: a cream bar with rounded bottom corners, the back
// arrow and the Feast "F" on the left, the title in the middle, and the screen's button
// on the right. It sits under the status bar (the safe-area inset).
export function AppHeader({ title, onBack, right }: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.xs }]}>
      <View style={styles.side}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.back}
          >
            <Ionicons name="chevron-back" size={iconSize.lg} color={colors.headerTint} />
          </Pressable>
        ) : null}
        <BrandImage variant="mark" height={28} />
      </View>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

// For a Stack's `header` option: the screen's title, a back arrow when there's a screen
// underneath, and the screen's headerRight.
export function stackHeader({ navigation, options, back }: NativeStackHeaderProps) {
  return (
    <AppHeader
      title={options.title ?? ""}
      onBack={back ? () => navigation.goBack() : undefined}
      right={options.headerRight?.({ tintColor: colors.headerTint, canGoBack: back !== undefined })}
    />
  );
}

// For a tab's `header` option (the Grocery tab, which has no stack of its own).
export function tabHeader({ options }: BottomTabHeaderProps) {
  return <AppHeader title={options.title ?? ""} />;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.headerBackground,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    // Draws over the top of the screen, so the shadow shows.
    zIndex: 1,
    ...shadows.header,
  },
  // Equal space either side keeps the title centred.
  side: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
  },
  right: {
    justifyContent: "flex-end",
  },
  // A 44-point square, with the arrow at its left edge.
  back: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    justifyContent: "center",
    marginRight: -spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.headerText,
    flexShrink: 1,
    textAlign: "center",
  },
});
