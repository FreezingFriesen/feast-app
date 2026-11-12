import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";

// Any icon name from the Ionicons set, e.g. "basket-outline".
export type IconName = ComponentProps<typeof Ionicons>["name"];

// An Ionicons icon that screen readers skip, for icons that sit next to text saying
// the same thing (a tick by "Saved", a meal-slot icon by "Breakfast").
export function DecorativeIcon(props: ComponentProps<typeof Ionicons>) {
  return <Ionicons {...props} accessibilityElementsHidden importantForAccessibility="no" />;
}
