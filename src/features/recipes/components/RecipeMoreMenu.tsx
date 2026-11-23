import { DecorativeIcon } from "@/components/DecorativeIcon";
import { borderWidth, colors, iconSize, MIN_TOUCH_TARGET, radius, spacing, typography } from "@/theme";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type RecipeMoreMenuProps = {
  onEdit: () => void;
};

// The "•••" button in the recipe detail header, and the small menu it opens. One item
// today: "Edit recipe". (Delete isn't built yet, so it isn't offered.) The menu closes on
// a tap outside it and on Android's Back button.
export function RecipeMoreMenu({ onEdit }: RecipeMoreMenuProps) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="More options"
        accessibilityState={{ expanded: open }}
        style={styles.trigger}
      >
        <DecorativeIcon name="ellipsis-horizontal" size={iconSize.lg} color={colors.action} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        {/* A tap anywhere outside the menu closes it. */}
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        >
          {/* Under the header's right side, where the button is. */}
          <View
            style={[styles.menu, { top: insets.top + MIN_TOUCH_TARGET + spacing.md }]}
            accessibilityViewIsModal
          >
            <Pressable
              onPress={() => {
                setOpen(false);
                onEdit();
              }}
              accessibilityRole="button"
              accessibilityLabel="Edit recipe"
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <DecorativeIcon name="create-outline" size={iconSize.md} color={colors.action} />
              <Text style={styles.itemText}>Edit recipe</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    flex: 1,
  },
  // A white card with a control-grey edge (no shadow: only the header and tab bar cast one).
  menu: {
    position: "absolute",
    right: spacing.lg,
    minWidth: MIN_TOUCH_TARGET * 4,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: borderWidth.thin,
    borderColor: colors.inputBorder,
    backgroundColor: colors.surface,
  },
  item: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  itemPressed: {
    backgroundColor: colors.chrome,
  },
  itemText: {
    ...typography.body,
    color: colors.text,
  },
});
