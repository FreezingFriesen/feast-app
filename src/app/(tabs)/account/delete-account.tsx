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

// Where the user is: "verify" (enter password), "confirm" (type username) or "done".
type Step = "verify" | "confirm" | "done";

// Opened from the signed-in Account page. Every deletion step is safe to repeat,
// so if it stops part way, "Try again" runs it again and finishes the job.
export default function DeleteAccountScreen() {
  const router = useRouter();
  const { security, deleteAccount } = useAccountFlows();
  // Clears everything Feast has saved on this phone.
  const localData = useLocalDataWiper();
  // The signed-in user and their profile (for the username).
  const account = useAccountProfile();
  // true or false once known, null while the first check is still running.
  const online = useOnline();
  const [step, setStep] = useState<Step>("verify");
  const [password, setPassword] = useState("");
  // The username as typed by the user to confirm.
  const [confirmation, setConfirmation] = useState("");
  // An error message under a box, keyed by its name ("password" or "confirmation").
  const [errors, setErrors] = useState<FieldErrors>({});
  // An error for the whole form, e.g. no connection.
  const [message, setMessage] = useState<string | null>(null);
  // Why the last deletion attempt failed, and what "Try again" should do.
  const [failure, setFailure] = useState<DeletionFailureView | null>(null);
  // True while checking the password or deleting, so buttons can't be pressed twice.
  const [busy, setBusy] = useState(false);
  // Kept when step 2 starts: the profile disappears from the phone as the account is deleted.
  const [subject, setSubject] = useState<{ username: string; email: string | null } | null>(null);

  // Only true once we know the phone is offline. While the first check is still
  // running, the buttons stay enabled.
  const offline = online === false;

  // Finished: the account is gone. "Done" goes back to the Account page.
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

    // Explain what went wrong, with a button to try clearing the phone again.
    return (
      <AccountFormScreen>
        <FormMessage tone="error" message={failure.message} />
        {message ? <FormMessage tone="error" message={message} /> : null}
        <SubmitButton label="Try again" busyLabel="Removing…" busy={busy} onPress={retryWipe} />
      </AccountFormScreen>
    );
  }

  // Nobody is signed in, or the profile isn't ready, so there's nothing to delete.
  // Not shown while busy: the profile disappears from the phone during the deletion,
  // and this message shouldn't replace the screen part way through.
  if (account.status !== "ready" && !busy) {
    return (
      <AccountFormScreen>
        <FormMessage tone="info" message="Log in to delete your account." />
        <SubmitButton label="Back to account" onPress={() => router.dismissTo("/account")} />
      </AccountFormScreen>
    );
  }

  // Step 1: "Continue" was pressed. Check the password, then move on to step 2.
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
        // Remember the username and email now, for the list shown in step 2.
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

  // Step 2: "Delete my account" was pressed. Delete everything.
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
      // It didn't work. Depending on why: go back to step 1 for a wrong password,
      // mark the username box if it doesn't match, or show the error with "Try again".
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

  // Step 1 on screen: the password box.
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

  // Step 2 on screen: the list of what will be deleted, and the box to type the username.
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
      {/* Autocomplete is turned off so the phone can't fill this in for the user. */}
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
      {/* The red delete button only works once the typed username matches. After a
          failed attempt it says "Try again". */}
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
