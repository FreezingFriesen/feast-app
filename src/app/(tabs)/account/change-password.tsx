// Change the password. Needs a connection, and always re-authenticates with the
// current password first (sensitive action).

import { issuesToFieldErrors, type FieldErrors } from "@/components/form/fieldErrors";
import { FormField } from "@/components/form/FormField";
import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { accountErrorMessage, accountFieldMessage, offlineMessage } from "@/features/account/accountMessages";
import { AccountFormScreen } from "@/features/account/components/AccountFormScreen";
import { useAccountFlows } from "@/features/account/useAccountFlows";
import { useAuthUser } from "@/features/account/useAuthUser";
import { useOnline } from "@/features/account/useOnline";
import { changePasswordFormSchema, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/validation/authSchema";
import { useRouter } from "expo-router";
import { useState } from "react";

// Tells iOS strong-password suggestions about our limits.
const PASSWORD_RULES = `minlength: ${MIN_PASSWORD_LENGTH}; maxlength: ${MAX_PASSWORD_LENGTH};`;
// The form with all three boxes empty. Used at the start and after a successful change.
const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };

// What has been typed into each of the three boxes.
type PasswordValues = typeof EMPTY;

// Opened from the signed-in Account page.
export default function ChangePasswordScreen() {
  const router = useRouter();
  const { security } = useAccountFlows();
  // The signed-in user, or null if nobody is signed in.
  const user = useAuthUser();
  // true or false once known, null while the first check is still running.
  const online = useOnline();
  const [values, setValues] = useState<PasswordValues>(EMPTY);
  // An error message under a box, keyed by its name (e.g. "newPassword").
  const [errors, setErrors] = useState<FieldErrors>({});
  // An error for the whole form, e.g. no connection.
  const [message, setMessage] = useState<string | null>(null);
  // True once the password has been changed, which switches the screen to the success message.
  const [changed, setChanged] = useState(false);
  // True while changing the password, so the button can't be pressed twice.
  const [busy, setBusy] = useState(false);

  // Nobody is signed in (e.g. the session ran out): ask them to log in first.
  if (!user) {
    return (
      <AccountFormScreen>
        <FormMessage tone="info" message="Log in to change your password." />
        <SubmitButton label="Log in" onPress={() => router.replace("/account/log-in")} />
      </AccountFormScreen>
    );
  }

  // After changing it: a success message and a button back to the Account page.
  if (changed) {
    return (
      <AccountFormScreen>
        <FormMessage tone="success" message="Your password has been changed." />
        <SubmitButton label="Done" onPress={() => router.back()} />
      </AccountFormScreen>
    );
  }

  // Only true once we know the phone is offline. While the first check is still
  // running, the button stays enabled.
  const offline = online === false;

  // Update a single field in the form values.
  function setField<K extends keyof PasswordValues>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  // Runs when "Change password" is pressed. Validates the form, then changes the password.
  async function handleChange() {
    setMessage(null);
    // Form check for instant feedback; the flow validates again before calling the server.
    const parsed = changePasswordFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error, accountFieldMessage));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      // The flow needs the confirmation too, so it gets the form values and parses them itself.
      const result = await security.changePassword(values);
      // It worked: clear every box so the passwords aren't kept, then show success.
      if (result.ok) {
        setValues(EMPTY);
        setChanged(true);
        return;
      }
      // It didn't work: clear the current password and show why. A wrong current
      // password is shown under that box; anything else is shown for the whole form.
      setValues((current) => ({ ...current, currentPassword: "" }));
      if (result.field === "currentPassword") {
        setErrors({ currentPassword: "That isn't your current password." });
      } else {
        setMessage(accountErrorMessage(result.error, "change_password"));
      }
    } finally {
      // Runs whether it worked or not, so the button is never stuck on "Changing password…".
      setBusy(false);
    }
  }

  // Render the form. Show a message if offline, and show errors for each field if present.
  return (
    <AccountFormScreen>
      {offline ? <FormMessage tone="info" message={offlineMessage("change_password")} /> : null}
      {/* The settings on each box hide what's typed, turn off autocorrect and capitals,
          and let the phone fill in the saved password or suggest a new one. */}
      <FormField
        label="Current password"
        value={values.currentPassword}
        onChangeText={(text) => setField("currentPassword", text)}
        error={errors.currentPassword}
        editable={!busy}
        maxLength={MAX_PASSWORD_LENGTH}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="next"
      />
      <FormField
        label="New password"
        value={values.newPassword}
        onChangeText={(text) => setField("newPassword", text)}
        error={errors.newPassword}
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
      {/* Pressing "Go" on the keyboard here does the same as the button. */}
      <FormField
        label="Confirm new password"
        value={values.confirmPassword}
        onChangeText={(text) => setField("confirmPassword", text)}
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
        onSubmitEditing={() => void handleChange()}
      />
      {message ? <FormMessage tone="error" message={message} /> : null}
      <SubmitButton
        label="Change password"
        busyLabel="Changing password…"
        busy={busy}
        disabled={offline}
        onPress={handleChange}
      />
    </AccountFormScreen>
  );
}
