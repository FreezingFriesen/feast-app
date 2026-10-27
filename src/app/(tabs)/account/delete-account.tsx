// Delete the account (N-17). Step 1 re-authenticates; step 2 explains what will be
// deleted and asks for the username to be typed out. Needs a connection.
import { issuesToFieldErrors, type FieldErrors } from "@/components/form/fieldErrors";
import { FormField } from "@/components/form/FormField";
import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { accountErrorMessage, accountFieldMessage, offlineMessage } from "@/features/account/accountMessages";
import { AccountFormScreen } from "@/features/account/components/AccountFormScreen";
import { TextAction } from "@/features/account/components/TextAction";
import {
  confirmsUsername,
  deletionFailureView,
  deletionItems,
  type DeletionFailureView,
} from "@/features/account/deleteAccountMessages";
import { useAccountFlows } from "@/features/account/useAccountFlows";
import { useAccountProfile } from "@/features/account/useAccountProfile";
import { useOnline } from "@/features/account/useOnline";
import { useLocalDataWiper } from "@/services/ServiceProvider";
import { MAX_PASSWORD_LENGTH, MAX_USERNAME_LENGTH, reauthSchema } from "@/validation/authSchema";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

type Step = "verify" | "confirm" | "done";

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { security, deleteAccount } = useAccountFlows();
  const localData = useLocalDataWiper();
  const account = useAccountProfile();
  const online = useOnline();
  const [step, setStep] = useState<Step>("verify");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<DeletionFailureView | null>(null);
  const [busy, setBusy] = useState(false);
  // Kept when step 2 starts: the profile disappears from the phone as the account is deleted.
  const [subject, setSubject] = useState<{ username: string; email: string | null } | null>(null);

  const offline = online === false;

  if (step === "done") {
    return (
      <AccountFormScreen>
        <FormMessage tone="success" message="Your account has been deleted." />
        <SubmitButton label="Done" onPress={() => router.dismissTo("/account")} />
      </AccountFormScreen>
    );
  }

  // The account is gone; only clearing this phone is left.
  if (failure?.retry === "wipe_local") {
    const retryWipe = async () => {
      setBusy(true);
      try {
        await localData.wipe();
        setStep("done");
      } catch {
        setMessage("That didn't work either. Try again in a moment.");
      } finally {
        setBusy(false);
      }
    };
    return (
      <AccountFormScreen>
        <FormMessage tone="error" message={failure.message} />
        {message ? <FormMessage tone="error" message={message} /> : null}
        <SubmitButton label="Try again" busyLabel="Removing…" busy={busy} onPress={retryWipe} />
      </AccountFormScreen>
    );
  }

  if (account.status !== "ready" && !busy) {
    return (
      <AccountFormScreen>
        <FormMessage tone="info" message="Log in to delete your account." />
        <SubmitButton label="Back to account" onPress={() => router.dismissTo("/account")} />
      </AccountFormScreen>
    );
  }

  async function handleVerify() {
    if (account.status !== "ready") return;
    setMessage(null);
    const parsed = reauthSchema.safeParse({ password });
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error, accountFieldMessage));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await security.verifyPassword(parsed.data);
      if (result.ok) {
        setSubject({ username: account.profile.username, email: account.user.email });
        setStep("confirm");
      } else if (result.field === "password") {
        setErrors({ password: "That password isn't right." });
      } else {
        setMessage(accountErrorMessage(result.error, "delete_account"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setFailure(null);
    setErrors({});
    setBusy(true);
    try {
      // The deleter re-authenticates again right before deleting, so the password from
      // step 1 is kept until then; it never leaves this screen's memory.
      const result = await deleteAccount.deleteAccount({ password, confirmation });
      if (result.ok) {
        setPassword("");
        setStep("done");
        return;
      }
      const view = deletionFailureView(result);
      if (view.field === "password") {
        setPassword("");
        setStep("verify");
        setErrors({ password: view.message });
      } else if (view.field === "confirmation") {
        setErrors({ confirmation: view.message });
      } else {
        setFailure(view);
      }
    } finally {
      setBusy(false);
    }
  }

  if (step === "verify" || subject === null) {
    return (
      <AccountFormScreen>
        {offline ? <FormMessage tone="info" message={offlineMessage("delete_account")} /> : null}
        <Text style={styles.intro}>
          Deleting your account is permanent. First, enter your password to confirm it&apos;s you.
        </Text>
        <FormField
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          editable={!busy}
          maxLength={MAX_PASSWORD_LENGTH}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="next"
          onSubmitEditing={() => void handleVerify()}
        />
        {message ? <FormMessage tone="error" message={message} /> : null}
        <SubmitButton label="Continue" busyLabel="Checking…" busy={busy} disabled={offline} onPress={handleVerify} />
        <TextAction label="Cancel" disabled={busy} onPress={() => router.back()} />
      </AccountFormScreen>
    );
  }

  return (
    <AccountFormScreen>
      {offline ? <FormMessage tone="info" message={offlineMessage("delete_account")} /> : null}
      <Text style={styles.heading} accessibilityRole="header">
        This will permanently delete:
      </Text>
      {deletionItems(subject.username, subject.email).map((item) => (
        <Text key={item} style={styles.item}>
          • {item}
        </Text>
      ))}
      <Text style={styles.warning}>This can&apos;t be undone.</Text>
      <FormField
        label={`Type your username (${subject.username}) to confirm`}
        value={confirmation}
        onChangeText={setConfirmation}
        error={errors.confirmation}
        editable={!busy}
        maxLength={MAX_USERNAME_LENGTH}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="none"
      />
      {failure ? <FormMessage tone="error" message={failure.message} /> : null}
      <SubmitButton
        label={failure?.retry === "delete" ? "Try again" : "Delete my account"}
        busyLabel="Deleting…"
        busy={busy}
        disabled={offline || !confirmsUsername(confirmation, subject.username)}
        variant="destructive"
        onPress={handleDelete}
      />
      <TextAction label="Cancel" disabled={busy} onPress={() => router.back()} />
    </AccountFormScreen>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontSize: 16,
    color: "#444",
    marginBottom: 16,
  },
  heading: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  item: {
    fontSize: 16,
    marginBottom: 6,
  },
  warning: {
    fontSize: 16,
    fontWeight: "600",
    color: "#c62828",
    marginTop: 8,
    marginBottom: 16,
  },
});
