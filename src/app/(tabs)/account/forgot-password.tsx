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

// The "Forgot password?" screen, opened from the log in form.
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { signIn } = useAccountFlows();
  // The signed-in user, or null if nobody is signed in.
  const user = useAuthUser();
  // true or false once known, null while the first check is still running.
  const online = useOnline();
  const [email, setEmail] = useState("");
  // An error message under the email box, if it isn't a valid email.
  const [errors, setErrors] = useState<FieldErrors>({});
  // An error for the whole form, e.g. no connection.
  const [message, setMessage] = useState<string | null>(null);
  // True once the email has been sent, which switches the screen to the "sent" message.
  const [sent, setSent] = useState(false);
  // True while sending, so the button can't be pressed twice.
  const [busy, setBusy] = useState(false);

  // Someone is already signed in, so there's no password to reset here.
  if (user) return <AlreadySignedIn />;

  // Only true once we know the phone is offline. While the first check is still
  // running, the button stays enabled.
  const offline = online === false;

  // Runs when "Send reset link" is pressed. Checks the email, then asks for the reset email to be sent.
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
      // Runs whether it worked or not, so the button is never stuck on "Sending…".
      setBusy(false);
    }
  }

  // After sending: a "check your email" message and a button back to the log in form.
  if (sent) {
    return (
      <AccountFormScreen>
        <FormMessage tone="success" message={PASSWORD_RESET_SENT} />
        <SubmitButton label="Back to log in" onPress={() => router.back()} />
      </AccountFormScreen>
    );
  }

  // Show the form to enter the email address and send the password reset email.
  return (
    <AccountFormScreen>
      {offline ? <FormMessage tone="info" message={offlineMessage("reset_password")} /> : null}
      <Text style={styles.intro}>Enter the email you use for Feast and we&apos;ll send you a link to reset your password.</Text>
      {/* Pressing "Send" on the keyboard does the same as the button. */}
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
