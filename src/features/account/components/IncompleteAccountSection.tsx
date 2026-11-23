import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { spacing } from "@/theme";
import { StyleSheet, View } from "react-native";
import { LogOutButton } from "./LogOutButton";

// Signed in, but the profile isn't on this device and couldn't be downloaded.
// (An account with no username never reaches the tabs: the auth gate shows the
// username step instead.)
type IncompleteAccountSectionProps = { onRetry: () => void };

// The Account tab when someone is signed in but the full page can't be shown yet.
// Explains why, offers to try again, and always lets them log out.
export function IncompleteAccountSection({ onRetry }: IncompleteAccountSectionProps) {
  return (
    <View style={styles.container}>
      <FormMessage tone="info" message="Your profile isn't on this phone yet. It will download when you're online." />
      <SubmitButton label="Try again" onPress={onRetry} />
      <LogOutButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
});
