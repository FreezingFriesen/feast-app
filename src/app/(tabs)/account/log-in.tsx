// Log in with email and password (N-14). Needs a connection.
import { issuesToFieldErrors, type FieldErrors } from "@/components/form/fieldErrors";
import { FormField } from "@/components/form/FormField";
import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { accountErrorMessage, accountFieldMessage, offlineMessage } from "@/features/account/accountMessages";
import { AccountFormScreen } from "@/features/account/components/AccountFormScreen";
import { AlreadySignedIn } from "@/features/account/components/AlreadySignedIn";
import { TextAction } from "@/features/account/components/TextAction";
import { useAccountFlows } from "@/features/account/useAccountFlows";
import { useAuthUser } from "@/features/account/useAuthUser";
import { useOnline } from "@/features/account/useOnline";
import { MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH, signInSchema } from "@/validation/authSchema";
import { useRouter } from "expo-router";
import { useState } from "react";

export default function LogInScreen() {
  const router = useRouter();
  const { signIn } = useAccountFlows();
  const user = useAuthUser();
  const online = useOnline();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // While busy the user appears as soon as the log in succeeds; don't flash this then.
  if (user && !busy) return <AlreadySignedIn />;

  const offline = online === false;

  async function handleLogIn() {
    setMessage(null);
    // Form check for instant feedback; the flow validates again before calling the server.
    const parsed = signInSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error, accountFieldMessage));
      return;
    }
    setErrors({});
    setBusy(true);

    const result = await signIn.signIn(parsed.data);
    if (result.status === "signed_in") {
      if (result.profile === "needs_username") {
        router.replace("/account/choose-username");
      } else {
        router.dismissTo("/account");
      }
      return;
    }
    setBusy(false);
    setValues((current) => ({ ...current, password: "" }));
    setMessage(accountErrorMessage(result.error, "log_in"));
  }

  return (
    <AccountFormScreen>
      {offline ? <FormMessage tone="info" message={offlineMessage("log_in")} /> : null}
      <FormField
        label="Email"
        value={values.email}
        onChangeText={(email) => setValues((current) => ({ ...current, email }))}
        error={errors.email}
        editable={!busy}
        maxLength={MAX_EMAIL_LENGTH}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        // "username" pairs this field with the password for iOS password autofill.
        textContentType="username"
        returnKeyType="next"
      />
      <FormField
        label="Password"
        value={values.password}
        onChangeText={(password) => setValues((current) => ({ ...current, password }))}
        error={errors.password}
        editable={!busy}
        maxLength={MAX_PASSWORD_LENGTH}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void handleLogIn()}
      />
      {message ? <FormMessage tone="error" message={message} /> : null}
      <SubmitButton label="Log in" busyLabel="Logging in…" busy={busy} disabled={offline} onPress={handleLogIn} />
      <TextAction label="Forgot password?" disabled={busy} onPress={() => router.push("/account/forgot-password")} />
      <TextAction
        label="New here? Create an account"
        disabled={busy}
        onPress={() => router.replace("/account/sign-up")}
      />
    </AccountFormScreen>
  );
}
