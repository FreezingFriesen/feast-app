import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { LogOutButton } from "./LogOutButton";

type IncompleteAccountSectionProps =
  // Signed in, but sign up stopped before the username was saved.
  | { reason: "needs_username" }
  // Signed in, but the profile isn't on this device and couldn't be downloaded.
  | { reason: "unavailable"; onRetry: () => void };

export function IncompleteAccountSection(props: IncompleteAccountSectionProps) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {props.reason === "needs_username" ? (
        <>
          <FormMessage tone="info" message="Choose a username to finish creating your account." />
          <SubmitButton label="Choose a username" onPress={() => router.push("/account/choose-username")} />
        </>
      ) : (
        <>
          <FormMessage
            tone="info"
            message="Your profile isn't on this phone yet. It will download when you're online."
          />
          <SubmitButton label="Try again" onPress={props.onRetry} />
        </>
      )}
      <LogOutButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
});
