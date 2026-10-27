import { useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { formatLongDate } from "../accountMessages";
import { useSessionStatus } from "../SessionStatusProvider";
import { AccountSection } from "./AccountSection";
import { TextAction } from "./TextAction";

// Session info (N-15) and changing the password.
export function SecuritySection() {
  const router = useRouter();
  const session = useSessionStatus();

  return (
    <AccountSection title="Sign-in and security">
      {session?.state === "active" ? (
        <Text style={styles.detail}>Signed in until {formatLongDate(session.expiresAt)}</Text>
      ) : null}
      <Text style={styles.note}>For your security, you&apos;ll be asked to log in again every 30 days.</Text>
      <TextAction label="Change password" onPress={() => router.push("/account/change-password")} />
    </AccountSection>
  );
}

const styles = StyleSheet.create({
  detail: {
    fontSize: 16,
    marginBottom: 4,
  },
  note: {
    fontSize: 14,
    color: "#666",
  },
});
