import { DecorativeIcon } from "@/components/DecorativeIcon";
import { formatServings } from "@/features/recipes/formatServings";
import { borderWidth, colors, iconSize, MIN_TOUCH_TARGET, radius, spacing, typography } from "@/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";

type ServingsStepperProps = {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  // Each button is disabled (and faded) at the lowest or highest number allowed.
  canDecrease: boolean;
  canIncrease: boolean;
  // Screen reader labels, e.g. "Fewer servings" / "More servings".
  decreaseLabel: string;
  increaseLabel: string;
  // Show the number between the buttons. Off where the number is shown elsewhere (the
  // recipe detail screen's stat strip), as in the recipe mockup.
  showValue?: boolean;
  // IDs for the automated button test (allButtons.e2e.js).
  decreaseTestID?: string;
  increaseTestID?: string;
};

// − and + buttons for a number of servings: outlined green 44pt squares, as in the
// recipe mockup. Used by the meal planner's Edit meal screen and the recipe detail screen.
export function ServingsStepper({
  value,
  onDecrease,
  onIncrease,
  canDecrease,
  canIncrease,
  decreaseLabel,
  increaseLabel,
  showValue = true,
  decreaseTestID,
  increaseTestID,
}: ServingsStepperProps) {
  return (
    <View style={styles.stepper}>
      <Pressable
        testID={decreaseTestID}
        onPress={onDecrease}
        disabled={!canDecrease}
        accessibilityRole="button"
        accessibilityLabel={decreaseLabel}
        accessibilityState={{ disabled: !canDecrease }}
        style={[styles.button, !canDecrease && styles.disabled]}
      >
        <DecorativeIcon name="remove" size={iconSize.lg} color={colors.action} />
      </Pressable>
      {showValue ? (
        <Text style={styles.value} accessibilityLabel={formatServings(value)}>
          {value}
        </Text>
      ) : null}
      <Pressable
        testID={increaseTestID}
        onPress={onIncrease}
        disabled={!canIncrease}
        accessibilityRole="button"
        accessibilityLabel={increaseLabel}
        accessibilityState={{ disabled: !canIncrease }}
        style={[styles.button, !canIncrease && styles.disabled]}
      >
        <DecorativeIcon name="add" size={iconSize.lg} color={colors.action} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  // Outlined green squares, like the servings buttons in the recipe mockup.
  button: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: borderWidth.thick,
    borderColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    ...typography.number,
    color: colors.text,
    minWidth: MIN_TOUCH_TARGET,
    textAlign: "center",
  },
  disabled: {
    opacity: 0.4,
  },
});
