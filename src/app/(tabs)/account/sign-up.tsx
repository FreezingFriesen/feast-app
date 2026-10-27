// Create an account with email, a unique username and a password (N-13). Needs a connection.
import { issuesToFieldErrors, type FieldErrors } from "@/components/form/fieldErrors";
import { FormField } from "@/components/form/FormField";
import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { accountErrorMessage, accountFieldMessage, offlineMessage } from "@/features/account/accountMessages";
import { AccountFormScreen } from "@/features/account/components/AccountFormScreen";
import { AlreadySignedIn } from "@/features/account/components/AlreadySignedIn";
import { TextAction } from "@/features/account/components/TextAction";
import { UsernameField } from "@/features/account/components/UsernameField";
import { useAccountFlows } from "@/features/account/useAccountFlows";
import { useAuthUser } from "@/features/account/useAuthUser";
import { useOnline } from "@/features/account/useOnline";
import {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  signUpFormSchema,
} from "@/validation/authSchema";
import { useRouter } from "expo-router";
import { useState } from "react";

// Tells iOS strong-password suggestions about our limits.
const PASSWORD_RULES = `minlength: ${MIN_PASSWORD_LENGTH}; maxlength: ${MAX_PASSWORD_LENGTH};`;

type SignUpValues = { email: string; username: string; password: string; confirmPassword: string };

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAccountFlows();
  const user = useAuthUser();
  const online = useOnline();
  const [values, setValues] = useState<SignUpValues>({ email: "", username: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // While busy the user appears part way through sign up; don't flash this then.
  if (user && !busy) return <AlreadySignedIn />;

  const offline = online === false;

  function setField<K extends keyof SignUpValues>(key: K, value: SignUpValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSignUp() {
    setMessage(null);
    // Form check for instant feedback; the flow validates again before calling the server.
    const parsed = signUpFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error, accountFieldMessage));
      return;
    }
    setErrors({});
    setBusy(true);

    // The flow needs the confirmation too, so it gets the form values and stores only
    // what its own parse returns.
    const result = await signUp.signUp(values);
    if (result.status === "signed_up") {
      router.dismissTo("/account");
      return;
    }
    if (result.status === "needs_username") {
      router.replace("/account/choose-username");
      return;
    }
    setBusy(false);
    if (result.error === "taken") {
      setErrors({ username: accountErrorMessage("taken", "sign_up") });
    } else {
      setMessage(accountErrorMessage(result.error, "sign_up"));
    }
  }

  return (
    <AccountFormScreen>
      {offline ? <FormMessage tone="info" message={offlineMessage("sign_up")} /> : null}
      <FormField
        label="Email"
        value={values.email}
        onChangeText={(email) => setField("email", email)}
        error={errors.email}
        editable={!busy}
        maxLength={MAX_EMAIL_LENGTH}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        // "username" pairs this field with the new password for iOS password autofill.
        textContentType="username"
        returnKeyType="next"
      />
      <UsernameField
        value={values.username}
        onChangeText={(username) => setField("username", username)}
        error={errors.username}
        editable={!busy}
      />
      <FormField
        label="Password"
        value={values.password}
        onChangeText={(password) => setField("password", password)}
        error={errors.password}
        editable={!busy}
        maxLength={MAX_PASSWORD_LENGTH}
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        passwordRules={PASSWORD_RULES}
        returnKeyType="next"
      />
      <FormField
        label="Confirm password"
        value={values.confirmPassword}
        onChangeText={(confirmPassword) => setField("confirmPassword", confirmPassword)}
        error={errors.confirmPassword}
        editable={!busy}
        maxLength={MAX_PASSWORD_LENGTH}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        passwordRules={PASSWORD_RULES}
        returnKeyType="go"
        onSubmitEditing={() => void handleSignUp()}
      />
      {message ? <FormMessage tone="error" message={message} /> : null}
      <SubmitButton
        label="Create account"
        busyLabel="Creating account…"
        busy={busy}
        disabled={offline}
        onPress={handleSignUp}
      />
      <TextAction
        label="Already have an account? Log in"
        disabled={busy}
        onPress={() => router.replace("/account/log-in")}
      />
    </AccountFormScreen>
  );
}
