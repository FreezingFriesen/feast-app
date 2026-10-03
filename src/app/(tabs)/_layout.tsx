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

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{ title: "Recipes", tabBarIcon: tabIcon("book-outline") }}
      />
      <Tabs.Screen
        name="meal-planner"
        options={{ title: "Meal Planner", tabBarIcon: tabIcon("calendar-outline") }}
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
