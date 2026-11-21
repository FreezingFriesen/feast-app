import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { useIngredientDataUpdatedAt } from "@/repositories/RepositoryProvider";
import { useIngredientRefresh, useSyncService } from "@/services/ServiceProvider";
import { colors, spacing, typography } from "@/theme";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { canSyncNow, ingredientDataLine, syncSummary } from "../syncMessages";
import { useOnline } from "../useOnline";
import { useSyncStatus } from "../useSyncStatus";
import { AccountSection } from "./AccountSection";

// Sync status (#19, N-19): last sync, pending changes, offline, errors, restore progress.
// Display and "Sync now" only; the sync engine (createSyncService) does the work.
export function SyncSection() {
  const sync = useSyncService();
  const ingredientRefresh = useIngredientRefresh();
  // What sync is doing now. Updates by itself as it changes.
  const status = useSyncStatus();
  const online = useOnline();
  // When the ingredient data on this phone was downloaded (N-08), or null if there is none.
  const ingredientDataUpdatedAt = useIngredientDataUpdatedAt();
  // True if the last "Sync now" press failed.
  const [failed, setFailed] = useState(false);
  // The status as a headline and an optional detail line, e.g. "2 changes waiting to sync".
  const summary = syncSummary(status, online);

  // Runs when "Sync now" is pressed. Nothing is lost if it fails: changes stay on the phone.
  // The ingredient data is downloaded again alongside. That never fails loudly (the copy
  // on the phone stays), so its result isn't shown; the date line updates if it worked.
  async function handleSyncNow() {
    setFailed(false);
    void ingredientRefresh.refreshIfDue({ force: true });
    await sync.syncNow().catch(() => setFailed(true));
  }

  return (
    <AccountSection title="Sync">
      <Text style={[styles.headline, summary.tone === "error" && styles.error]} accessibilityLiveRegion="polite">
        {summary.headline}
      </Text>
      {summary.detail ? <Text style={styles.detail}>{summary.detail}</Text> : null}
      {ingredientDataUpdatedAt !== null ? (
        <Text style={styles.ingredientData}>{ingredientDataLine(ingredientDataUpdatedAt)}</Text>
      ) : null}
      {failed ? <FormMessage tone="error" message="Couldn't sync right now. Your changes are still saved on this phone." /> : null}
      {/* Disabled when offline, while already syncing, or when sync isn't available. */}
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
    ...typography.bodyStrong,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  error: {
    color: colors.error,
  },
  detail: {
    ...typography.body,
    color: colors.textMuted,
  },
  ingredientData: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
