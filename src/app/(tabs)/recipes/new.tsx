// This screen allows the user to create a new recipe by filling out a form with various fields 
// such as title, description, ingredients, steps, and diet tags. 
// The form is validated before submission, and any errors are displayed to the user.
import { ChipSelect } from "@/components/form/ChipSelect";
import { FieldError, FormField } from "@/components/form/FormField";
import {
  emptyIngredientRow,
  emptyRecipeForm,
  emptyStepRow,
  issuesToFieldErrors,
  MAX_INGREDIENT_ROWS,
  MAX_STEP_ROWS,
  toRecipeInput,
  type FieldErrors,
  type IngredientFormRow,
  type RecipeFormValues,
} from "@/features/recipes/recipeForm";
import { useRecipeRepository } from "@/repositories/RepositoryProvider";
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
function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

// The NewRecipeScreen component renders a form for creating a new recipe, handles form state and validation,
// and submits the recipe to the repository when the user saves it.
export default function NewRecipeScreen() {
  const router = useRouter();
  const recipes = useRecipeRepository();
  const [values, setValues] = useState<RecipeFormValues>(emptyRecipeForm);
  const [errors, setErrors] = useState<FieldErrors>({});
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
    const input = toRecipeInput(values);
    const parsed = recipeSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error));
      return;
    }

    // If validation passes, attempt to create the recipe in the repository and handle any errors.
    setSaving(true);
    try {
      const result = await recipes.create(parsed.data);
      if (!result.ok) {
        setErrors(issuesToFieldErrors(result.error));
        return;
      }
      router.back();
    } finally {
      setSaving(false);
    }
  }

  // Determine if there are any validation errors in the form values.
  const hasErrors = Object.keys(errors).length > 0;

  // Render the form for creating a new recipe, including fields for title, description, servings, prep time, cook time,
  // meal types, ingredients, steps, diet tags, and notes. The form includes buttons for adding/removing ingredients
  // and steps, and a save button that triggers the handleSave function.
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
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

        <Text style={styles.sectionTitle}>Meal types</Text>
        <ChipSelect
          options={MEAL_TYPES}
          selected={values.mealTypes}
          onToggle={(value) => setField("mealTypes", toggle(values.mealTypes, value))}
        />
        {errors.mealTypes ? <FieldError message={errors.mealTypes} /> : null}

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
            <ChipSelect
              options={UNITS}
              selected={row.unit === "" ? [] : [row.unit]}
              onToggle={(unit) => updateIngredient(index, { unit: row.unit === unit ? "" : unit })}
              formatLabel={(unit) => unit}
            />
            {errors[`ingredients.${index}.unit`] ? (
              <FieldError message={errors[`ingredients.${index}.unit`]} />
            ) : null}
            {values.ingredients.length > 1 ? (
              <Pressable
                onPress={() =>
                  setField(
                    "ingredients",
                    values.ingredients.filter((_, i) => i !== index),
                  )
                }
                accessibilityRole="button"
              >
                <Text style={styles.removeText}>Remove ingredient</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {errors.ingredients ? <FieldError message={errors.ingredients} /> : null}
        {values.ingredients.length < MAX_INGREDIENT_ROWS ? (
          <Pressable
            onPress={() => setField("ingredients", [...values.ingredients, emptyIngredientRow()])}
            accessibilityRole="button"
          >
            <Text style={styles.addText}>+ Add ingredient</Text>
          </Pressable>
        ) : null}

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
                hitSlop={8}
              >
                <Text style={styles.removeText}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {errors.steps ? <FieldError message={errors.steps} /> : null}
        {values.steps.length < MAX_STEP_ROWS ? (
          <Pressable
            onPress={() => setField("steps", [...values.steps, emptyStepRow()])}
            accessibilityRole="button"
          >
            <Text style={styles.addText}>+ Add step</Text>
          </Pressable>
        ) : null}

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

        {hasErrors ? <FieldError message="Please fix the highlighted fields." /> : null}
        <Pressable
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        >
          <Text style={styles.saveText}>{saving ? "Saving…" : "Save recipe"}</Text>
        </Pressable>
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
    padding: 16,
    paddingBottom: 48,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    gap: 4,
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
    gap: 8,
  },
  stepNumber: {
    fontSize: 16,
    paddingTop: 10,
  },
  addText: {
    color: "#208AEF",
    fontSize: 16,
    fontWeight: "600",
    paddingVertical: 8,
  },
  removeText: {
    color: "#c62828",
    fontSize: 14,
    paddingVertical: 8,
  },
  spacer: {
    height: 12,
  },
  saveButton: {
    backgroundColor: "#208AEF",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
