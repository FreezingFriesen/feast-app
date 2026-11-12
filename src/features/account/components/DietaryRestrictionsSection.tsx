import { ChipSelect } from "@/components/form/ChipSelect";
import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import type { Profile } from "@/repositories/ProfileRepository";
import { useProfileRepository } from "@/repositories/RepositoryProvider";
import { colors, spacing, typography } from "@/theme";
import { dietaryRestrictionsSchema } from "@/validation/profileSchema";
import { ALLERGENS, DIET_TAGS } from "@/validation/recipeSchema";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import {
  canSave,
  describeRestrictions,
  saveLabel,
  toDietaryFormValues,
  toggleChoice,
  type DietaryFormValues,
} from "../dietaryRestrictionsForm";
import { AccountSection } from "./AccountSection";

// Allergies and diets (N-18). Saved on this phone first, so it works offline;
// updatedAt is set by the repository and sync uploads it later (last edit wins).
export function DietaryRestrictionsSection({ profile }: { profile: Profile }) {
  const profiles = useProfileRepository();
  // What's saved now. null means the user hasn't set them yet.
  const saved = profile.dietaryRestrictions;

  // The user's picks. savedAt is set once they're saved, and the draft is shown until
  // the profile reloads with that save (so the chips don't flash back to the old choices).
  const [draft, setDraft] = useState<{ values: DietaryFormValues; savedAt: number | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  // Show the draft while it has unsaved changes, or until the profile catches up with the save.
  const showingDraft = draft !== null && (draft.savedAt === null || profile.updatedAt < draft.savedAt);
  // The chips that are highlighted on screen.
  const values = showingDraft ? draft.values : toDietaryFormValues(saved);
  // Saved, but the profile hasn't reloaded yet. The button stays disabled meanwhile.
  const waitingForReload = showingDraft && draft.savedAt !== null;

  // Update the draft values when the user toggles a chip. This doesn't save to the repository yet.
  function update(next: DietaryFormValues) {
    setMessage(null);
    setDraft({ values: next, savedAt: null });
  }

  // Runs when the save button is pressed. Saves the picks to the profile on this phone.
  async function handleSave() {
    // Form check for instant feedback; the repository validates again before writing.
    const parsed = dietaryRestrictionsSchema.safeParse(values);
    if (!parsed.success) {
      setMessage({ tone: "error", text: "These choices couldn't be saved. Please try again." });
      return;
    }
    setSaving(true);
    try {
      const result = await profiles.setDietaryRestrictions(profile.uid, parsed.data);
      // Keep showing what was saved (marked with its save time) until the profile reloads.
      if (result.ok) {
        setDraft({
          values: toDietaryFormValues(result.profile.dietaryRestrictions),
          savedAt: result.profile.updatedAt,
        });
        setMessage({ tone: "success", text: "Saved on this phone." });
      } else {
        setMessage({ tone: "error", text: "These choices couldn't be saved. Please try again." });
      }
    } finally {
      setSaving(false);
    }
  }

  // The section shows the saved choices, a note about how they are used, and the chip selects for allergies and diets.
  // If the user hasn't set any yet, it shows an info message. The save button is disabled if there are no changes or if the profile
  // is waiting to reload after a save. Before anything is set, the button reads "I don't have any" until a chip is picked.
  return (
    <AccountSection title="Dietary restrictions">
      <Text style={styles.summary}>{describeRestrictions(saved)}</Text>
      <Text style={styles.note}>
        Feast filters recipes by these by default. You can turn the filter off while browsing.
      </Text>
      {saved === null ? (
        <FormMessage tone="info" message="You haven't set these yet. Pick any that apply, or choose “I don't have any”." />
      ) : null}

      <Text style={styles.groupTitle}>Allergies</Text>
      <ChipSelect
        options={ALLERGENS}
        selected={values.allergens}
        onToggle={(allergen) => update({ ...values, allergens: toggleChoice(values.allergens, allergen) })}
      />
      <Text style={styles.groupTitle}>Diets</Text>
      <ChipSelect
        options={DIET_TAGS}
        selected={values.diets}
        onToggle={(diet) => update({ ...values, diets: toggleChoice(values.diets, diet) })}
      />

      {message ? <FormMessage tone={message.tone} message={message.text} /> : null}
      <SubmitButton
        label={saveLabel(saved, values)}
        busyLabel="Saving…"
        busy={saving}
        disabled={waitingForReload || !canSave(saved, values)}
        onPress={handleSave}
      />
    </AccountSection>
  );
}

const styles = StyleSheet.create({
  summary: {
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  note: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  groupTitle: {
    ...typography.bodyStrong,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
});
