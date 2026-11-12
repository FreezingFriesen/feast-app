import { ChipSelect } from "@/components/form/ChipSelect";
import { issuesToFieldErrors, type FieldErrors } from "@/components/form/fieldErrors";
import { FieldError, FormField } from "@/components/form/FormField";
import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { TextAction } from "@/components/TextAction";
import type { ManualGroceryItemData } from "@/repositories/GroceryRepository";
import { colors, spacing, typography } from "@/theme";
import { MAX_GROCERY_NAME_LENGTH, manualGroceryItemSchema } from "@/validation/groceryItemSchema";
import { UNITS } from "@/validation/recipeSchema";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { z } from "zod";
import { groceryWriteMessage } from "../groceryView";
import { emptyManualItemForm, QUANTITY_INPUT_MAX_LENGTH, toManualItemInput, type ManualItemFormValues } from "../manualItemForm";

// What saving reports back: saved, errors to show under the fields, or one message for
// the whole form (e.g. the week already has the most items allowed).
export type AddItemOutcome = { ok: true } | { ok: false; error: z.ZodError } | { ok: false; message: string };

type AddGroceryItemFormProps = {
  // Saves the checked item (the parsed data, never the raw form values).
  onAdd: (item: ManualGroceryItemData) => Promise<AddItemOutcome>;
};

// The fields the form shows errors under. Anything else gets the general message.
const FIELDS = ["name", "quantity", "unit"] as const;

// "+ Add item" under the list. Opens an inline form: a name, an optional amount and unit.
// The form stays open after adding, so several items can be added in a row.
export function AddGroceryItemForm({ onAdd }: AddGroceryItemFormProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ManualItemFormValues>(emptyManualItemForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return <TextAction label="+ Add item" align="start" onPress={() => setOpen(true)} accessibilityLabel="Add an item to this week's list" />;
  }

  // Changes one box. Errors stay until the next try, as in the recipe form.
  function setField<K extends keyof ManualItemFormValues>(field: K, value: ManualItemFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  // Shows the schema's issues under their boxes, or the general message if none of them
  // belong to a box (the repository refused something the form doesn't show).
  function showIssues(error: z.ZodError) {
    const fieldErrors = issuesToFieldErrors(error);
    setErrors(fieldErrors);
    setMessage(FIELDS.some((field) => field in fieldErrors) ? null : groceryWriteMessage("invalid"));
  }

  async function submit() {
    // Check the form first for instant feedback; the repository checks again before saving.
    const parsed = manualGroceryItemSchema.safeParse(toManualItemInput(values));
    if (!parsed.success) {
      showIssues(parsed.error);
      return;
    }
    setErrors({});
    setMessage(null);
    setBusy(true);
    try {
      const outcome = await onAdd(parsed.data);
      if (outcome.ok) {
        setValues(emptyManualItemForm());
        setErrors({});
        setMessage(null);
      } else if ("error" in outcome) {
        showIssues(outcome.error);
      } else {
        setMessage(outcome.message);
      }
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setValues(emptyManualItemForm());
    setErrors({});
    setMessage(null);
  }

  return (
    <View style={styles.form}>
      <Text style={styles.title} accessibilityRole="header">
        Add an item
      </Text>
      {message ? <FormMessage tone="error" message={message} /> : null}
      <FormField
        label="Item"
        value={values.name}
        onChangeText={(text) => setField("name", text)}
        maxLength={MAX_GROCERY_NAME_LENGTH}
        placeholder="e.g. Paper towels"
        error={errors.name}
      />
      <FormField
        label="Amount (optional)"
        value={values.quantity}
        onChangeText={(text) => setField("quantity", text)}
        keyboardType="decimal-pad"
        maxLength={QUANTITY_INPUT_MAX_LENGTH}
        error={errors.quantity}
      />
      {/* One unit. Tapping the selected unit again clears it. */}
      <Text style={styles.label}>Unit (with an amount)</Text>
      <ChipSelect
        options={UNITS}
        selected={values.unit === "" ? [] : [values.unit]}
        onToggle={(unit) => setField("unit", values.unit === unit ? "" : unit)}
        formatLabel={(unit) => unit}
      />
      {errors.unit ? <FieldError message={errors.unit} /> : null}
      <SubmitButton label="Add to list" busyLabel="Adding…" busy={busy} onPress={submit} />
      <TextAction label="Done" onPress={close} accessibilityLabel="Close the add item form" />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    paddingTop: spacing.md,
  },
  title: {
    ...typography.groupHeading,
    color: colors.action,
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.label,
    color: colors.text,
    marginBottom: spacing.xs,
  },
});
