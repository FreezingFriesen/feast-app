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

const PASSWORD_RULES = `minlength: ${MIN_PASSWORD_LENGTH}; maxlength: ${MAX_PASSWORD_LENGTH};`;
const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };

type PasswordValues = typeof EMPTY;

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { security } = useAccountFlows();
  const user = useAuthUser();
  const online = useOnline();
  const [values, setValues] = useState<PasswordValues>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <AccountFormScreen>
        <FormMessage tone="info" message="Log in to change your password." />
        <SubmitButton label="Log in" onPress={() => router.replace("/account/log-in")} />
      </AccountFormScreen>
    );
  }

  if (changed) {
    return (
      <AccountFormScreen>
        <FormMessage tone="success" message="Your password has been changed." />
        <SubmitButton label="Done" onPress={() => router.back()} />
      </AccountFormScreen>
    );
  }

  const offline = online === false;

  function setField<K extends keyof PasswordValues>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

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
      if (result.ok) {
        setValues(EMPTY);
        setChanged(true);
        return;
      }
      setValues((current) => ({ ...current, currentPassword: "" }));
      if (result.field === "currentPassword") {
        setErrors({ currentPassword: "That isn't your current password." });
      } else {
        setMessage(accountErrorMessage(result.error, "change_password"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountFormScreen>
      {offline ? <FormMessage tone="info" message={offlineMessage("change_password")} /> : null}
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
