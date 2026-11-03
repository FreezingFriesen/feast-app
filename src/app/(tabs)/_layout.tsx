// The tab bar along the bottom of the app: Recipes, Meal Planner, Grocery List and Account.
import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";

// Any icon name from the Ionicons set, e.g. "book-outline".
type IconName = ComponentProps<typeof Ionicons>["name"];

// Makes the icon for one tab. The tab bar passes in the colour (highlighted when
// the tab is selected) and the size.
function tabIcon(name: IconName) {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  }
  return TabIcon;
}

// This layout is shared across all the routes defined in the /(tabs) directory.
// Each Tabs.Screen is one tab. "name" is the file or folder it opens, and "title" is
// the text under the icon.
export default function TabLayout() {
  return (
    <Tabs>
      {/* index only redirects to Recipes, so href: null hides it from the tab bar. */}
      <Tabs.Screen name="index" options={{ href: null }} />
      {/* Recipes, Meal Planner and Account each have their own stack of screens that
          draws the header, so the tab's header is turned off to avoid showing two. */}
      <Tabs.Screen
        name="recipes"
        options={{ title: "Recipes", headerShown: false, tabBarIcon: tabIcon("book-outline") }}
      />
      <Tabs.Screen
        name="meal-planner"
        options={{ title: "Meal Planner", headerShown: false, tabBarIcon: tabIcon("calendar-outline") }}
      />
      {/* Grocery List is a single screen, so it uses the tab's own header. */}
      <Tabs.Screen
        name="grocery-list"
        options={{ title: "Grocery List", tabBarIcon: tabIcon("cart-outline") }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Account", headerShown: false, tabBarIcon: tabIcon("person-outline") }}
      />
    </Tabs>
  );
}
