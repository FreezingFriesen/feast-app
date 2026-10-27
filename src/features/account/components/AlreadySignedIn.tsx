import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

// Shown if a signed-out screen (log in, sign up, reset password) is opened while
// someone is already signed in, e.g. from a deep link.
export function AlreadySignedIn() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <FormMessage tone="info" message="You're already logged in." />
      <SubmitButton label="Go to your account" onPress={() => router.dismissTo("/account")} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
});
