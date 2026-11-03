import { Redirect } from "expo-router";

// The app opens on the Recipes tab. This route is hidden from the tab bar
// (see _layout.tsx) and only sends the user on to /recipes.
export default function Index() {
  return <Redirect href="/recipes" />;
}
