// Log in with email and password (N-14). Needs a connection.
import { issuesToFieldErrors, type FieldErrors } from "@/components/form/fieldErrors";
import { FormField } from "@/components/form/FormField";
import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { accountErrorMessage, accountFieldMessage, offlineMessage } from "@/features/account/accountMessages";
import { AccountFormScreen } from "@/features/account/components/AccountFormScreen";
import { AlreadySignedIn } from "@/features/account/components/AlreadySignedIn";
import { TextAction } from "@/components/TextAction";
import { useAccountFlows } from "@/features/account/useAccountFlows";
import { useAuthUser } from "@/features/account/useAuthUser";
import { useOnline } from "@/features/account/useOnline";
import { MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH, signInSchema } from "@/validation/authSchema";
import { useRouter } from "expo-router";
import { useState } from "react";

// The log in form. After logging in, it goes back to the Account page, or on to
// choosing a username if this account's sign up never finished.
export default function LogInScreen() {
  const router = useRouter();
  // The account actions (log in, sign up, ...). The screen never talks to Firebase directly.
  const { signIn } = useAccountFlows();
  // The signed-in user, or null if nobody is signed in.
  const user = useAuthUser();
  // true or false once known, null while the first check is still running.
  const online = useOnline();
  // What has been typed into each box.
  const [values, setValues] = useState({ email: "", password: "" });
  // An error message under a box, keyed by its name (e.g. "email").
  const [errors, setErrors] = useState<FieldErrors>({});
  // An error for the whole form, e.g. a wrong email or password.
  const [message, setMessage] = useState<string | null>(null);
  // True while logging in. The boxes and buttons are locked until it finishes.
  const [busy, setBusy] = useState(false);

  // While busy the user appears as soon as the log in succeeds; don't flash this then.
  if (user && !busy) return <AlreadySignedIn />;

  // Only true once we know the phone is offline. While the first check is still
  // running, the button stays enabled.
  const offline = online === false;

  // Runs when "Log in" is pressed. Validates the form, then tries to log in.
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

    // If it worked, go back to the Account page (or on to choosing a username).
    // replace() swaps this screen for the next one, so Back doesn't return to the log in form.
    const result = await signIn.signIn(parsed.data);
    if (result.status === "signed_in") {
      if (result.profile === "needs_username") {
        router.replace("/account/choose-username");
      } else {
        router.dismissTo("/account");
      }
      return;
    }
    // It didn't work: unlock the form, clear the password, and show why.
    setBusy(false);
    setValues((current) => ({ ...current, password: "" }));
    setMessage(accountErrorMessage(result.error, "log_in"));
  }

  return (
    <AccountFormScreen>
      {/* A note at the top when the phone is offline, since logging in needs a connection. */}
      {offline ? <FormMessage tone="info" message={offlineMessage("log_in")} /> : null}
      {/* The settings below set the right keyboard, turn off autocorrect and capitals,
          and let the phone fill in saved emails and passwords. */}
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
      {/* secureTextEntry hides the password as it's typed. Pressing "Go" on the
          keyboard logs in, the same as pressing the button. */}
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
      {/* Links to the other signed-out screens. */}
      <TextAction label="Forgot password?" disabled={busy} onPress={() => router.push("/account/forgot-password")} />
      <TextAction
        label="New here? Create an account"
        disabled={busy}
        onPress={() => router.replace("/account/sign-up")}
      />
    </AccountFormScreen>
  );
}
