// Finish creating an account whose sign up stopped before the username was saved (N-13).
// The uid always comes from the signed-in session, never from route params.
import { issuesToFieldErrors, type FieldErrors } from "@/components/form/fieldErrors";
import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { accountErrorMessage, accountFieldMessage, offlineMessage } from "@/features/account/accountMessages";
import { AccountFormScreen } from "@/features/account/components/AccountFormScreen";
import { UsernameField } from "@/features/account/components/UsernameField";
import { useAccountFlows } from "@/features/account/useAccountFlows";
import { useAuthUser } from "@/features/account/useAuthUser";
import { useOnline } from "@/features/account/useOnline";
import { chooseUsernameSchema } from "@/validation/authSchema";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

export default function ChooseUsernameScreen() {
  const router = useRouter();
  const { signUp } = useAccountFlows();
  const user = useAuthUser();
  const online = useOnline();
  const [username, setUsername] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <AccountFormScreen>
        <FormMessage tone="info" message="Log in to finish creating your account." />
        <SubmitButton label="Log in" onPress={() => router.replace("/account/log-in")} />
      </AccountFormScreen>
    );
  }

  const offline = online === false;

  async function handleSave() {
    setMessage(null);
    const parsed = chooseUsernameSchema.safeParse({ username });
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error, accountFieldMessage));
      return;
    }
    setErrors({});
    setBusy(true);

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

  return (
    <AccountFormScreen>
      {offline ? <FormMessage tone="info" message={offlineMessage("choose_username")} /> : null}
      <Text style={styles.intro}>
        Your account was created, but its username wasn&apos;t saved. Choose one to finish.
      </Text>
      <UsernameField value={username} onChangeText={setUsername} error={errors.username} editable={!busy} />
      {message ? <FormMessage tone="error" message={message} /> : null}
      <SubmitButton label="Save username" busyLabel="Saving…" busy={busy} disabled={offline} onPress={handleSave} />
    </AccountFormScreen>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontSize: 16,
    color: "#444",
    marginBottom: 16,
  },
});
