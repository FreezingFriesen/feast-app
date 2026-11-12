// Finish creating an account whose sign up stopped before the username was saved (N-13).
// The uid always comes from the signed-in session, never from route params.
import { issuesToFieldErrors, type FieldErrors } from "@/components/form/fieldErrors";
import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { accountErrorMessage, accountFieldMessage, offlineMessage } from "@/features/account/accountMessages";
import { AccountFormScreen } from "@/features/account/components/AccountFormScreen";
import { colors, spacing, typography } from "@/theme";
import { UsernameField } from "@/features/account/components/UsernameField";
import { useAccountFlows } from "@/features/account/useAccountFlows";
import { useAuthUser } from "@/features/account/useAuthUser";
import { useOnline } from "@/features/account/useOnline";
import { chooseUsernameSchema } from "@/validation/authSchema";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

// Opened after logging in or signing up when the account has no username yet.
export default function ChooseUsernameScreen() {
  const router = useRouter();
  const { signUp } = useAccountFlows();
  // The signed-in user, or null if nobody is signed in.
  const user = useAuthUser();
  // true or false once known, null while the first check is still running.
  const online = useOnline();
  const [username, setUsername] = useState("");
  // An error message under the username box, e.g. it's already taken.
  const [errors, setErrors] = useState<FieldErrors>({});
  // An error for the whole form, e.g. no connection.
  const [message, setMessage] = useState<string | null>(null);
  // True while saving, so the button can't be pressed twice.
  const [busy, setBusy] = useState(false);

  // If the user isn't logged in, show a message and a button to log in. Otherwise, show the form.
  if (!user) {
    return (
      <AccountFormScreen>
        <FormMessage tone="info" message="Log in to finish creating your account." />
        <SubmitButton label="Log in" onPress={() => router.replace("/account/log-in")} />
      </AccountFormScreen>
    );
  }

  // Only true once we know the phone is offline. While the first check is still
  // running, the button stays enabled.
  const offline = online === false;

  // Runs when "Save username" is pressed. Checks the username, then saves it.
  async function handleSave() {
    setMessage(null);
    const parsed = chooseUsernameSchema.safeParse({ username });
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error, accountFieldMessage));
      return;
    }
    setErrors({});
    setBusy(true);

    // If it worked, go back to the Account page. A taken username is shown under the
    // username box; anything else is shown for the whole form.
    const result = await signUp.chooseUsername(parsed.data);
    if (result.ok) {
      router.dismissTo("/account");
      return;
    }
    setBusy(false);
    if (result.error === "taken") {
      setErrors({ username: accountErrorMessage("taken", "choose_username") });
    } else {
      setMessage(accountErrorMessage(result.error, "choose_username"));
    }
  }

  // Render the form. Show a message if offline, and show errors for the username field if present.
  return (
    <AccountFormScreen>
      {offline ? <FormMessage tone="info" message={offlineMessage("choose_username")} /> : null}
      <Text style={styles.intro}>
        Your account was created, but its username wasn&apos;t saved. Choose one to finish.
      </Text>
      {/* Checks as the user types whether the username is free. */}
      <UsernameField value={username} onChangeText={setUsername} error={errors.username} editable={!busy} />
      {message ? <FormMessage tone="error" message={message} /> : null}
      <SubmitButton label="Save username" busyLabel="Saving…" busy={busy} disabled={offline} onPress={handleSave} />
    </AccountFormScreen>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
});
