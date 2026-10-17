import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";

type IconName = ComponentProps<typeof Ionicons>["name"];

function tabIcon(name: IconName) {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  }
  return TabIcon;
}

// This layout is shared across all the routes defined in the /(tabs) directory.
export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="recipes"
        options={{ title: "Recipes", headerShown: false, tabBarIcon: tabIcon("book-outline") }}
      />
      <Tabs.Screen
        name="meal-planner"
        options={{ title: "Meal Planner", headerShown: false, tabBarIcon: tabIcon("calendar-outline") }}
      />
      <Tabs.Screen
        name="grocery-list"
        options={{ title: "Grocery List", tabBarIcon: tabIcon("cart-outline") }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Account", tabBarIcon: tabIcon("person-outline") }}
      />
    </Tabs>
  );
}
