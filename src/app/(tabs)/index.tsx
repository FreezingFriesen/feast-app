import { Redirect } from "expo-router";

// The app opens on the Recipes tab.
export default function Index() {
  return <Redirect href="/recipes" />;
}
