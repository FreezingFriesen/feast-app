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

// What has been typed into each box.
type SignUpValues = { email: string; username: string; password: string; confirmPassword: string };

// The sign up form. After the account is created, it goes back to the Account page.
export default function SignUpScreen() {
  const router = useRouter();
  // The account actions. The screen never talks to Firebase directly.
  const { signUp } = useAccountFlows();
  // The signed-in user, or null if nobody is signed in.
  const user = useAuthUser();
  // true or false once known, null while the first check is still running.
  const online = useOnline();
  const [values, setValues] = useState<SignUpValues>({ email: "", username: "", password: "", confirmPassword: "" });
  // An error message under a box, keyed by its name (e.g. "username").
  const [errors, setErrors] = useState<FieldErrors>({});
  // An error for the whole form, e.g. no connection.
  const [message, setMessage] = useState<string | null>(null);
  // True while the account is being created. The boxes and buttons are locked until it finishes.
  const [busy, setBusy] = useState(false);

  // While busy the user appears part way through sign up; don't flash this then.
  if (user && !busy) return <AlreadySignedIn />;

  // Only true once we know the phone is offline. While the first check is still
  // running, the button stays enabled.
  const offline = online === false;

  // Update a single field in the form values. The type of the value is inferred from the key.
  function setField<K extends keyof SignUpValues>(key: K, value: SignUpValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  // Runs when "Create account" is pressed. Validates the form, then creates the account.
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
    // Everything worked: back to the Account page.
    if (result.status === "signed_up") {
      router.dismissTo("/account");
      return;
    }
    // The account was created but the username couldn't be saved, so ask for one.
    if (result.status === "needs_username") {
      router.replace("/account/choose-username");
      return;
    }
    // It didn't work. A taken username is shown under the username box; anything
    // else is shown for the whole form.
    setBusy(false);
    if (result.error === "taken") {
      setErrors({ username: accountErrorMessage("taken", "sign_up") });
    } else {
      setMessage(accountErrorMessage(result.error, "sign_up"));
    }
  }

  // Render the form. Show a message if offline, and show errors for each field if present.
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
      {/* Checks as the user types whether the username is free. */}
      <UsernameField
        value={values.username}
        onChangeText={(username) => setField("username", username)}
        error={errors.username}
        editable={!busy}
      />
      {/* "new-password" lets the phone suggest a strong password and save it. */}
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
      {/* Pressing "Go" on the keyboard here creates the account, the same as the button. */}
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
