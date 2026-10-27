import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { useSyncService } from "@/services/ServiceProvider";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { canSyncNow, syncSummary } from "../syncMessages";
import { useOnline } from "../useOnline";
import { useSyncStatus } from "../useSyncStatus";
import { AccountSection } from "./AccountSection";

// Sync status (#19, N-19): last sync, pending changes, offline, errors, restore progress.
// Display and "Sync now" only; the sync engine is separate work (a stub for now).
export function SyncSection() {
  const sync = useSyncService();
  const status = useSyncStatus();
  const online = useOnline();
  const [failed, setFailed] = useState(false);
  const summary = syncSummary(status, online);

  async function handleSyncNow() {
    setFailed(false);
    await sync.syncNow().catch(() => setFailed(true));
  }

  return (
    <AccountSection title="Sync">
      <Text style={[styles.headline, summary.tone === "error" && styles.error]} accessibilityLiveRegion="polite">
        {summary.headline}
      </Text>
      {summary.detail ? <Text style={styles.detail}>{summary.detail}</Text> : null}
      {failed ? <FormMessage tone="error" message="Couldn't sync right now. Your changes are still saved on this phone." /> : null}
      <SubmitButton
        label="Sync now"
        busyLabel="Syncing…"
        busy={status.state === "syncing"}
        disabled={!canSyncNow(status, online)}
        variant="secondary"
        onPress={handleSyncNow}
      />
    </AccountSection>
  );
}

const styles = StyleSheet.create({
  headline: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  error: {
    color: "#c62828",
  },
  detail: {
    fontSize: 15,
    color: "#444",
  },
});
