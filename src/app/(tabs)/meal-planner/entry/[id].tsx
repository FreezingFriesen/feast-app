// Edit one planned meal: change its servings, move it to another day or slot,
// or remove it from the plan.
import { ChipSelect, formatOptionLabel } from "@/components/form/ChipSelect";
import { FieldError } from "@/components/form/FormField";
import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { formatServings } from "@/features/meal-planner/components/DaySlots";
import { WeekStrip } from "@/features/meal-planner/components/WeekStrip";
import { formatDay, todayKey } from "@/features/meal-planner/dates";
import { writeErrorMessage } from "@/features/meal-planner/writeErrorMessage";
import { useRecipesById } from "@/features/recipes/useRecipes";
import type { MealPlanEntry } from "@/repositories/MealPlanRepository";
import { useMealPlanRepository } from "@/repositories/RepositoryProvider";
import {
  MAX_SERVINGS,
  mealPlanEntryIdSchema,
  MIN_SERVINGS,
  PLANNER_MEAL_TYPES,
} from "@/validation/mealPlanSchema";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const NOT_FOUND = (
  <PlaceholderScreen title="Meal not found" description="This meal is no longer in your plan." />
);

export default function EntryScreen() {
  // Route params are user-controllable (deep links), so validate before use.
  const { id } = useLocalSearchParams();
  const parsed = mealPlanEntryIdSchema.safeParse(id);
  if (!parsed.success) return NOT_FOUND;
  return <EntryLoader id={parsed.data} />;
}

function EntryLoader({ id }: { id: string }) {
  const mealPlans = useMealPlanRepository();
  // undefined = still loading, null = not found
  const [entry, setEntry] = useState<MealPlanEntry | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    mealPlans.getById(id).then((found) => {
      if (active) setEntry(found ?? null);
    });
    return () => {
      active = false;
    };
  }, [mealPlans, id]);

  if (entry === undefined) return null;
  if (entry === null) return NOT_FOUND;
  return <EntryEditor entry={entry} />;
}

function EntryEditor({ entry }: { entry: MealPlanEntry }) {
  const router = useRouter();
  const mealPlans = useMealPlanRepository();
  const recipe = useRecipesById().get(entry.recipeId);
  const [servings, setServings] = useState(entry.servings);
  const [date, setDate] = useState(entry.date);
  const [mealType, setMealType] = useState(entry.mealType);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const changed =
    servings !== entry.servings || date !== entry.date || mealType !== entry.mealType;

  // The repository validates the update again before writing.
  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const result = await mealPlans.update(entry.id, { date, mealType, servings });
      if (!result.ok) {
        setError(writeErrorMessage(result));
        return;
      }
      router.back();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    setError(null);
    try {
      const removed = await mealPlans.remove(entry.id);
      if (!removed) {
        setError(writeErrorMessage({ ok: false, reason: "not_found" }));
        return;
      }
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={[styles.recipeTitle, !recipe && styles.unavailable]}>
        {recipe?.title ?? "Recipe unavailable"}
      </Text>

      <Text style={styles.sectionTitle}>Servings</Text>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => setServings((current) => Math.max(MIN_SERVINGS, current - 1))}
          disabled={servings <= MIN_SERVINGS}
          accessibilityRole="button"
          accessibilityLabel="Fewer servings"
          style={[styles.stepperButton, servings <= MIN_SERVINGS && styles.disabled]}
        >
          <Text style={styles.stepperText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue} accessibilityLabel={formatServings(servings)}>
          {servings}
        </Text>
        <Pressable
          onPress={() => setServings((current) => Math.min(MAX_SERVINGS, current + 1))}
          disabled={servings >= MAX_SERVINGS}
          accessibilityRole="button"
          accessibilityLabel="More servings"
          style={[styles.stepperButton, servings >= MAX_SERVINGS && styles.disabled]}
        >
          <Text style={styles.stepperText}>+</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Move to</Text>
      <WeekStrip selectedKey={date} onSelect={setDate} todayKey={todayKey()} />
      <View style={styles.spacer} />
      <ChipSelect
        options={PLANNER_MEAL_TYPES}
        selected={[mealType]}
        onToggle={setMealType}
      />
      <Text style={styles.summary}>
        {formatDay(date)} · {formatOptionLabel(mealType)}
      </Text>

      {error ? <FieldError message={error} /> : null}
      <Pressable
        onPress={handleSave}
        disabled={saving || !changed}
        accessibilityRole="button"
        style={[styles.saveButton, (saving || !changed) && styles.disabled]}
      >
        <Text style={styles.saveText}>{saving ? "Saving…" : "Save changes"}</Text>
      </Pressable>
      <Pressable
        onPress={handleRemove}
        disabled={saving}
        accessibilityRole="button"
        style={styles.removeButton}
      >
        <Text style={styles.removeText}>Remove from plan</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 48,
  },
  recipeTitle: {
    fontSize: 22,
    fontWeight: "600",
  },
  unavailable: {
    color: "#999",
    fontStyle: "italic",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 20,
    marginBottom: 8,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#208AEF",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperText: {
    color: "#208AEF",
    fontSize: 22,
    fontWeight: "600",
  },
  stepperValue: {
    fontSize: 20,
    fontWeight: "600",
    minWidth: 40,
    textAlign: "center",
  },
  spacer: {
    height: 12,
  },
  summary: {
    fontSize: 15,
    color: "#666",
    marginTop: 12,
  },
  saveButton: {
    backgroundColor: "#208AEF",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  disabled: {
    opacity: 0.4,
  },
  saveText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  removeButton: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 8,
  },
  removeText: {
    color: "#c62828",
    fontSize: 16,
    fontWeight: "600",
  },
});
