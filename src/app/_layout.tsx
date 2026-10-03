import { Stack } from "expo-router";
import { RepositoryProvider } from "@/repositories/RepositoryProvider";

export default function RootLayout() {
  return (
    <RepositoryProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </RepositoryProvider>
  );
}
