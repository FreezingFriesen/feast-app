import { DecorativeIcon, type IconName } from "@/components/DecorativeIcon";
import { borderWidth, colors, iconSize, radius, spacing, tileSize, typography } from "@/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";

type AccountMenuRowProps = {
  icon: IconName;
  title: string;
  // The small line under the title, e.g. "Manage".
  caption: string;
  onPress: () => void;
};

// One row of the Account menu, as in the mockup: an icon in a cream tile, the title and
// a caption, and a chevron. Opens another Account screen.
export function AccountMenuRow({ icon, title, caption, onPress }: AccountMenuRowProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={styles.row}>
      {/* Orange is fine here: the icon is decoration next to the title. */}
      <View style={styles.tile}>
        <DecorativeIcon name={icon} size={iconSize.md} color={colors.accent} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.caption}>{caption}</Text>
      </View>
      <DecorativeIcon name="chevron-forward" size={iconSize.md} color={colors.action} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: borderWidth.thin,
    borderBottomColor: colors.border,
  },
  tile: {
    width: tileSize.md,
    height: tileSize.md,
    borderRadius: radius.sm,
    backgroundColor: colors.chrome,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  caption: {
    ...typography.small,
    color: colors.textMuted,
  },
});
