// The tab bar along the bottom of the app: Meal plan, Recipes, Grocery and Account.
import { tabHeader } from "@/components/AppHeader";
import { tabScreenOptions, typography } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router/js-tabs";
import type { ComponentProps } from "react";
import { Text, type ColorValue } from "react-native";

// Any icon name from the Ionicons set, e.g. "book-outline".
type IconName = ComponentProps<typeof Ionicons>["name"];

// Makes the icon for one tab. The tab bar passes in the colour (green when the tab is
// selected, grey otherwise) and the size.
function tabIcon(name: IconName) {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  }
  return TabIcon;
}

// Makes the text under one tab's icon. The selected tab's text is also bold, so it
// doesn't rely on colour alone.
function tabLabel(text: string) {
  function TabLabel({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Text style={[focused ? typography.tabLabelActive : typography.tabLabel, { color }]}>{text}</Text>;
  }
  return TabLabel;
}

// This layout is shared across all the routes defined in the /(tabs) directory.
// Each Tabs.Screen is one tab, in the order they appear. "name" is the file or folder
// it opens. "title" is what screen readers announce for the tab, and tabBarLabel is the
// shorter text under the icon.
export default function TabLayout() {
  return (
    <Tabs screenOptions={tabScreenOptions}>
      {/* index only redirects to Recipes, so href: null hides it from the tab bar. It
          stays first so the app still opens on Recipes. */}
      <Tabs.Screen name="index" options={{ href: null }} />
      {/* Meal Planner, Recipes and Account each have their own stack of screens that
          draws the header, so the tab's header is turned off to avoid showing two. */}
      <Tabs.Screen
        name="meal-planner"
        options={{
          title: "Meal Planner",
          headerShown: false,
          tabBarLabel: tabLabel("Meal plan"),
          tabBarIcon: tabIcon("calendar-outline"),
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: "Recipes",
          headerShown: false,
          tabBarLabel: tabLabel("Recipes"),
          tabBarIcon: tabIcon("book-outline"),
        }}
      />
      {/* Grocery List is a single screen, so the tab draws its header (the same
          AppHeader the stacks use). */}
      <Tabs.Screen
        name="grocery-list"
        options={{
          title: "Grocery List",
          header: tabHeader,
          tabBarLabel: tabLabel("Grocery"),
          tabBarIcon: tabIcon("basket-outline"),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          headerShown: false,
          tabBarLabel: tabLabel("Account"),
          tabBarIcon: tabIcon("person-outline"),
        }}
      />
    </Tabs>
  );
}
