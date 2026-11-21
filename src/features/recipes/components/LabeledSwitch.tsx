import { colors, MIN_TOUCH_TARGET, spacing, typography } from "@/theme";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

type LabeledSwitchProps = {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  // A muted line under the label, e.g. when the switch has an effect.
  caption?: string;
  // For screen readers, when the visible label needs different wording.
  accessibilityLabel?: string;
};

// A switch with its label, as one control. The whole row is the tap target (at least 44
// points tall) and the screen reader sees one "switch" with an on/off state. The Switch
// itself only shows the state: it ignores touches, so a tap can never toggle it twice.
// The "on" track is green because that's a control state, labelled in text; it never
// means "allergen-safe".
export function LabeledSwitch({ label, value, onValueChange, caption, accessibilityLabel }: LabeledSwitchProps) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={caption}
      style={styles.row}
    >
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Switch
          value={value}
          trackColor={{ false: colors.inputBorder, true: colors.action }}
          thumbColor={colors.surface}
          ios_backgroundColor={colors.inputBorder}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.xs,
  },
  // Takes the room the switch doesn't, so long labels wrap at large text sizes.
  text: {
    flex: 1,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
});
