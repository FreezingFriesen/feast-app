// This screen allows the user to create a new recipe by filling out a form with various fields 
// such as title, description, ingredients, steps, and diet tags. 
// The form is validated before submission, and any errors are displayed to the user (N-01).
import { DecorativeIcon } from "@/components/DecorativeIcon";
import { ChipSelect } from "@/components/form/ChipSelect";
import { issuesToFieldErrors, type FieldErrors } from "@/components/form/fieldErrors";
import { FieldError, FormField } from "@/components/form/FormField";
import { SubmitButton } from "@/components/form/SubmitButton";
import { TextAction } from "@/components/TextAction";
import {
  emptyIngredientRow,
  emptyRecipeForm,
  emptyStepRow,
  MAX_INGREDIENT_ROWS,
  MAX_STEP_ROWS,
  toRecipeInput,
  type IngredientFormRow,
  type RecipeFormValues,
} from "@/features/recipes/recipeForm";
import { useRecipeRepository } from "@/repositories/RepositoryProvider";
import { borderWidth, colors, iconSize, MIN_TOUCH_TARGET, radius, spacing, typography } from "@/theme";
import { DIET_TAGS, MEAL_TYPES, recipeSchema, UNITS } from "@/validation/recipeSchema";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

// A utility function that toggles the presence of a value in a list.
// Adds it if it's missing, removes it if it's there. Used by the chip pickers.
function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

// The NewRecipeScreen component renders a form for creating a new recipe, handles form state and validation,
// and submits the recipe to the repository when the user saves it.
export default function NewRecipeScreen() {
  const router = useRouter();
  // Where recipes are saved. The screen never talks to the database directly.
  const recipes = useRecipeRepository();
  // Everything typed into the form, kept as text exactly as typed.
  const [values, setValues] = useState<RecipeFormValues>(emptyRecipeForm);
  // Error message for each field that failed validation, keyed by field name.
  const [errors, setErrors] = useState<FieldErrors>({});
  // True while the recipe is being saved, so the save button can't be pressed twice.
  const [saving, setSaving] = useState(false);

  // A helper function that updates a specific field in the form values state.
  function setField<K extends keyof RecipeFormValues>(key: K, value: RecipeFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  // A helper function that updates a specific ingredient row in the form values state.
  function updateIngredient(index: number, patch: Partial<IngredientFormRow>) {
    setValues((current) => ({
      ...current,
      ingredients: current.ingredients.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  // A helper function that updates a specific step in the form values state.
  function updateStep(index: number, text: string) {
    setValues((current) => ({
      ...current,
      steps: current.steps.map((step, i) => (i === index ? { ...step, text } : step)),
    }));
  }

  // The handleSave function validates the form values and submits the new recipe to the repository.
  async function handleSave() {
    // Form-level check for instant feedback; the repository validates again before writing.
    // toRecipeInput turns the typed text into numbers and drops the React row keys.
    const input = toRecipeInput(values);
    const parsed = recipeSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error));
      return;
    }

    // If validation passes, attempt to create the recipe in the repository and handle any errors.
    // Save parsed.data (the cleaned version), not the raw form values.
    // On success, go back to the recipe list.
    setSaving(true);
    try {
      const result = await recipes.create(parsed.data);
      if (!result.ok) {
        setErrors(issuesToFieldErrors(result.error));
        return;
      }
      router.back();
    } finally {
      // Runs whether the save worked or not, so the button is never stuck on "Saving…".
      setSaving(false);
    }
  }

  // Determine if there are any validation errors in the form values.
  const hasErrors = Object.keys(errors).length > 0;

  // Render the form for creating a new recipe, including fields for title, description, servings, prep time, cook time,
  // meal types, ingredients, steps, diet tags, and notes. The form includes buttons for adding/removing ingredients
  // and steps, and a save button that triggers the handleSave function.
  return (
    // KeyboardAvoidingView moves the form up on iOS so the keyboard doesn't cover the
    // field being typed in. Android does this by itself.
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      {/* keyboardShouldPersistTaps lets a button be tapped while the keyboard is open. */}
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Each FormField shows its label, the text box, and its error message (if any).
            maxLength stops typing past the limit the schema allows. */}
        <FormField
          label="Title"
          value={values.title}
          onChangeText={(text) => setField("title", text)}
          maxLength={100}
          placeholder="e.g. Grandma's apple pie"
          error={errors.title}
        />
        <FormField
          label="Description"
          value={values.description}
          onChangeText={(text) => setField("description", text)}
          maxLength={500}
          multiline
          placeholder="Optional"
          error={errors.description}
        />

        {/* Servings, prep time and cook time side by side, with a number keyboard. */}
        <View style={styles.row}>
          <FormField
            label="Servings"
            value={values.servings}
            onChangeText={(text) => setField("servings", text)}
            keyboardType="number-pad"
            maxLength={3}
            error={errors.servings}
          />
          <FormField
            label="Prep (min)"
            value={values.prepTimeMinutes}
            onChangeText={(text) => setField("prepTimeMinutes", text)}
            keyboardType="number-pad"
            maxLength={4}
            error={errors.prepTimeMinutes}
          />
          <FormField
            label="Cook (min)"
            value={values.cookTimeMinutes}
            onChangeText={(text) => setField("cookTimeMinutes", text)}
            keyboardType="number-pad"
            maxLength={4}
            error={errors.cookTimeMinutes}
          />
        </View>

        {/* Meal types: tap to pick any of Breakfast, Lunch, Dinner, Snack. The meal
            planner lists recipes tagged with a slot's meal type first. */}
        <Text style={styles.sectionTitle}>Meal types</Text>
        <ChipSelect
          options={MEAL_TYPES}
          selected={values.mealTypes}
          onToggle={(value) => setField("mealTypes", toggle(values.mealTypes, value))}
        />
        {errors.mealTypes ? <FieldError message={errors.mealTypes} /> : null}

        {/* Ingredients: one card per row, with a name, a quantity and a unit.
            row.key is a stable ID for React, so typing stays in the right row when one
            is removed. Errors are keyed by position, e.g. "ingredients.0.name". */}
        <Text style={styles.sectionTitle}>Ingredients</Text>
        {values.ingredients.map((row, index) => (
          <View key={row.key} style={styles.card}>
            <View style={styles.row}>
              <FormField
                placeholder="Ingredient"
                accessibilityLabel={`Ingredient ${index + 1} name`}
                value={row.name}
                onChangeText={(name) => updateIngredient(index, { name })}
                maxLength={100}
                error={errors[`ingredients.${index}.name`]}
                style={styles.nameInput}
              />
              <FormField
                placeholder="Qty"
                accessibilityLabel={`Ingredient ${index + 1} quantity`}
                value={row.quantity}
                onChangeText={(quantity) => updateIngredient(index, { quantity })}
                keyboardType="decimal-pad"
                maxLength={8}
                error={errors[`ingredients.${index}.quantity`]}
                style={styles.qtyInput}
              />
            </View>
            {/* One unit per ingredient. Tapping the selected unit again clears it. */}
            <ChipSelect
              options={UNITS}
              selected={row.unit === "" ? [] : [row.unit]}
              onToggle={(unit) => updateIngredient(index, { unit: row.unit === unit ? "" : unit })}
              formatLabel={(unit) => unit}
            />
            {errors[`ingredients.${index}.unit`] ? (
              <FieldError message={errors[`ingredients.${index}.unit`]} />
            ) : null}
            {/* A recipe needs at least one ingredient, so the last row can't be removed. */}
            {values.ingredients.length > 1 ? (
              <TextAction
                label="Remove ingredient"
                accessibilityLabel={`Remove ingredient ${index + 1}`}
                tone="destructive"
                align="start"
                onPress={() =>
                  setField(
                    "ingredients",
                    values.ingredients.filter((_, i) => i !== index),
                  )
                }
              />
            ) : null}
          </View>
        ))}
        {errors.ingredients ? <FieldError message={errors.ingredients} /> : null}
        {/* The "Add" button disappears once the maximum number of rows is reached. */}
        {values.ingredients.length < MAX_INGREDIENT_ROWS ? (
          <TextAction
            label="+ Add ingredient"
            align="start"
            onPress={() => setField("ingredients", [...values.ingredients, emptyIngredientRow()])}
          />
        ) : null}

        {/* Steps: numbered text boxes, with the same add and remove rules as ingredients. */}
        <Text style={styles.sectionTitle}>Steps</Text>
        {values.steps.map((step, index) => (
          <View key={step.key} style={styles.stepRow}>
            <Text style={styles.stepNumber}>{index + 1}.</Text>
            <FormField
              accessibilityLabel={`Step ${index + 1}`}
              value={step.text}
              onChangeText={(text) => updateStep(index, text)}
              maxLength={1000}
              multiline
              placeholder="Describe this step"
              error={errors[`steps.${index}`]}
            />
            {values.steps.length > 1 ? (
              <Pressable
                onPress={() => setField("steps", values.steps.filter((_, i) => i !== index))}
                accessibilityRole="button"
                accessibilityLabel={`Remove step ${index + 1}`}
                style={styles.removeStep}
              >
                <DecorativeIcon name="close-circle-outline" size={iconSize.lg} color={colors.error} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {errors.steps ? <FieldError message={errors.steps} /> : null}
        {values.steps.length < MAX_STEP_ROWS ? (
          <TextAction
            label="+ Add step"
            align="start"
            onPress={() => setField("steps", [...values.steps, emptyStepRow()])}
          />
        ) : null}

        {/* Diet tags (#5): tap to pick any that apply, e.g. Vegan or Gluten free. */}
        <Text style={styles.sectionTitle}>Diet tags</Text>
        <ChipSelect
          options={DIET_TAGS}
          selected={values.dietTags}
          onToggle={(value) => setField("dietTags", toggle(values.dietTags, value))}
        />
        {errors.dietTags ? <FieldError message={errors.dietTags} /> : null}

        <View style={styles.spacer} />
        <FormField
          label="Notes"
          value={values.notes}
          onChangeText={(text) => setField("notes", text)}
          maxLength={1000}
          multiline
          placeholder="Optional"
          error={errors.notes}
        />

        {/* A reminder by the save button, since the errors may be scrolled out of view. */}
        {hasErrors ? <FieldError message="Please fix the highlighted fields." /> : null}
        {/* Disabled while saving, so it can't be pressed twice. */}
        <SubmitButton label="Save recipe" busyLabel="Saving…" busy={saving} onPress={handleSave} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Define styles for the components in the NewRecipeScreen.
const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  // Green section headings, as on the Account page.
  sectionTitle: {
    ...typography.groupHeading,
    color: colors.action,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  card: {
    borderWidth: borderWidth.thin,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.surface,
  },
  nameInput: {
    minWidth: 160,
  },
  qtyInput: {
    width: 80,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  // Lines the number up with the text inside the box next to it.
  stepNumber: {
    ...typography.bodyStrong,
    color: colors.text,
    paddingTop: spacing.md,
  },
  // A 44-point square around the remove icon.
  removeStep: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  spacer: {
    height: spacing.md,
  },
});
