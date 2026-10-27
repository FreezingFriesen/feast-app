// Send a password reset email (N-16). Needs a connection. The answer is the same
// whether or not an account exists for the email.
import { issuesToFieldErrors, type FieldErrors } from "@/components/form/fieldErrors";
import { FormField } from "@/components/form/FormField";
import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import {
  accountErrorMessage,
  accountFieldMessage,
  offlineMessage,
  PASSWORD_RESET_SENT,
} from "@/features/account/accountMessages";
import { AccountFormScreen } from "@/features/account/components/AccountFormScreen";
import { AlreadySignedIn } from "@/features/account/components/AlreadySignedIn";
import { useAccountFlows } from "@/features/account/useAccountFlows";
import { useAuthUser } from "@/features/account/useAuthUser";
import { useOnline } from "@/features/account/useOnline";
import { MAX_EMAIL_LENGTH, passwordResetSchema } from "@/validation/authSchema";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { signIn } = useAccountFlows();
  const user = useAuthUser();
  const online = useOnline();
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (user) return <AlreadySignedIn />;

  const offline = online === false;

  async function handleSend() {
    setMessage(null);
    const parsed = passwordResetSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error, accountFieldMessage));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await signIn.sendPasswordReset(parsed.data);
      if (result.ok) {
        setSent(true);
      } else {
        setMessage(accountErrorMessage(result.error, "reset_password"));
      }
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AccountFormScreen>
        <FormMessage tone="success" message={PASSWORD_RESET_SENT} />
        <SubmitButton label="Back to log in" onPress={() => router.back()} />
      </AccountFormScreen>
    );
  }

  return (
    <AccountFormScreen>
      {offline ? <FormMessage tone="info" message={offlineMessage("reset_password")} /> : null}
      <Text style={styles.intro}>Enter the email you use for Feast and we&apos;ll send you a link to reset your password.</Text>
      <FormField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        editable={!busy}
        maxLength={MAX_EMAIL_LENGTH}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={() => void handleSend()}
      />
      {message ? <FormMessage tone="error" message={message} /> : null}
      <SubmitButton label="Send reset link" busyLabel="Sending…" busy={busy} disabled={offline} onPress={handleSend} />
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
