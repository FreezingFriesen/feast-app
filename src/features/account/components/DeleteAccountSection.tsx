import { useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { AccountSection } from "./AccountSection";
import { TextAction } from "./TextAction";

// The way into deleting the account (N-17). The steps are on their own screen.
export function DeleteAccountSection() {
  const router = useRouter();
  return (
    <AccountSection title="Delete account">
      <Text style={styles.note}>Permanently delete your account and everything saved to it. This can&apos;t be undone.</Text>
      <TextAction label="Delete account…" tone="destructive" onPress={() => router.push("/account/delete-account")} />
    </AccountSection>
  );
}

const styles = StyleSheet.create({
  note: {
    fontSize: 14,
    color: "#666",
  },
});
