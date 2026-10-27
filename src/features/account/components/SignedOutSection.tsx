import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { sessionEndedMessage } from "../accountMessages";
import { useSessionStatus } from "../SessionStatusProvider";

// The Account tab when nobody is signed in.
export function SignedOutSection() {
  const router = useRouter();
  const ended = sessionEndedMessage(useSessionStatus());

  return (
    <View style={styles.container}>
      {ended ? <FormMessage tone="info" message={ended} /> : null}
      <Text style={styles.title} accessibilityRole="header">
        Your Feast account
      </Text>
      <Text style={styles.description}>
        Log in to back up your recipes and meal plans and use them on your other devices.
      </Text>
      <SubmitButton label="Log in" onPress={() => router.push("/account/log-in")} />
      <SubmitButton label="Create an account" variant="secondary" onPress={() => router.push("/account/sign-up")} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: "#444",
  },
});
