import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { useState } from "react";
import { Alert } from "react-native";
import { accountErrorMessage } from "../accountMessages";
import { logOutPrompt, type LogOutChoice } from "../logOutPrompt";
import { useAccountFlows } from "../useAccountFlows";
import { useOnline } from "../useOnline";
import { useSyncStatus } from "../useSyncStatus";

// Log out after confirming. Warns about unsynced changes and offers to sync first.
// Logging out itself works offline.
export function LogOutButton() {
  const { logOut } = useAccountFlows();
  // How many changes are waiting to sync, and whether sync is working at all.
  const status = useSyncStatus();
  const online = useOnline();
  // True while logging out, so the button can't be pressed twice.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Logs out, after syncing first if the user chose "Sync, then log out".
  // If sync fails, the user stays logged in so nothing is lost.
  async function run(choice: LogOutChoice) {
    setBusy(true);
    setError(null);
    try {
      const result = await logOut.logOut({ syncFirst: choice === "sync_then_log_out" });
      if (!result.ok) {
        setError(
          result.error === "sync_failed"
            ? accountErrorMessage("sync_failed", "log_in")
            : "You're logged out, but some data couldn't be removed from this phone.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  // Shows the phone's own pop-up asking "Log out?". The wording and buttons come from
  // logOutPrompt, which depends on whether there are unsynced changes. Cancel does nothing.
  function confirmLogOut() {
    const prompt = logOutPrompt({
      pendingChanges: status.pendingChanges,
      online,
      syncAvailable: status.state !== "unavailable",
      wipesLocalData: logOut.wipesLocalData,
    });
    Alert.alert(
      prompt.title,
      prompt.message,
      prompt.actions.map(({ label, choice, style }) => ({
        text: label,
        style,
        onPress: choice ? () => void run(choice) : undefined,
      })),
    );
  }

  return (
    <>
      {error ? <FormMessage tone="error" message={error} /> : null}
      <SubmitButton label="Log out" busyLabel="Logging out…" busy={busy} variant="secondary" onPress={confirmLogOut} />
    </>
  );
}
