// The Grocery List tab (#6, N-07, N-09, N-10). The list is worked out from the week's
// meal plan on the phone, so it works offline (#18). Only the user's own check marks and
// added items are stored (locally, not synced). See src/features/grocery/.
import { EmptyState } from "@/components/EmptyState";
import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { AddGroceryItemForm, type AddItemOutcome } from "@/features/grocery/components/AddGroceryItemForm";
import { GroceryRow } from "@/features/grocery/components/GroceryRow";
import { WeekSelector } from "@/features/grocery/components/WeekSelector";
import type { GroceryLine } from "@/features/grocery/generateGroceryList";
import {
  amountText,
  currentWeekStart,
  groceryWriteMessage,
  orderForDisplay,
  rowAccessibilityLabel,
  skippedMealsMessage,
  UNCOMBINED_CAPTION,
  type GroceryWriteProblem,
} from "@/features/grocery/groceryView";
import { useGroceryWeek } from "@/features/grocery/useGroceryWeek";
import type { DateKey } from "@/features/meal-planner/dates";
import type { ManualGroceryItem, ManualGroceryItemData } from "@/repositories/GroceryRepository";
import { useGroceryRepository } from "@/repositories/RepositoryProvider";
import { colors, spacing, typography } from "@/theme";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, SectionList, StyleSheet, Text, View } from "react-native";

// One row of the list: a line worked out from the meal plan, or an item the user added.
type Row =
  | { kind: "line"; key: string; line: GroceryLine; checked: boolean }
  | { kind: "manual"; key: string; item: ManualGroceryItem };

type Section = { key: "plan" | "manual"; title: string; data: Row[] };

export default function GroceryListScreen() {
  const router = useRouter();
  const repository = useGroceryRepository();
  // The Monday of this week. The list opens on it.
  const thisWeek = currentWeekStart();
  const [weekStart, setWeekStart] = useState<DateKey>(thisWeek);
  // Why the last change wasn't saved, if it wasn't.
  const [writeError, setWriteError] = useState<string | null>(null);
  const week = useGroceryWeek(weekStart);

  function changeWeek(next: DateKey) {
    setWeekStart(next);
    setWriteError(null);
  }

  // Runs one change. It reports a problem or null; a storage failure is a problem too, so
  // nothing fails silently.
  async function save(change: () => Promise<GroceryWriteProblem | null>) {
    try {
      const problem = await change();
      setWriteError(problem === null ? null : groceryWriteMessage(problem));
    } catch {
      setWriteError(groceryWriteMessage("failed"));
    }
  }

  const toggleLine = (key: string, checked: boolean) =>
    save(async () => {
      const result = await repository.setChecked(weekStart, key, checked);
      if (result.ok) return null;
      return result.reason === "limit" ? "check_limit" : "invalid";
    });

  const toggleItem = (item: ManualGroceryItem) =>
    save(async () => ((await repository.setManualItemChecked(item.id, !item.checked)) ? null : "failed"));

  const removeItem = (item: ManualGroceryItem) =>
    save(async () => ((await repository.removeManualItem(item.id)) ? null : "failed"));

  // The add form checks the item first; the repository checks it again before saving.
  async function addItem(item: ManualGroceryItemData): Promise<AddItemOutcome> {
    try {
      const result = await repository.addManualItem(weekStart, item);
      if (result.ok) return { ok: true };
      if (result.reason === "invalid") return { ok: false, error: result.error };
      return { ok: false, message: groceryWriteMessage("item_limit") };
    } catch {
      return { ok: false, message: groceryWriteMessage("failed") };
    }
  }

  // Wait for the meal plan, recipes and check marks, so "no meals planned" never flashes.
  if (!week.loaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.action} accessibilityLabel="Loading your grocery list" />
      </View>
    );
  }

  const lines = orderForDisplay(week.list.lines, (line) => week.checked.has(line.key));
  const manualItems = orderForDisplay(week.manualItems, (item) => item.checked);
  const sections: Section[] = [
    ...(lines.length > 0
      ? [
          {
            key: "plan" as const,
            title: "From your meal plan",
            data: lines.map((line): Row => ({ kind: "line", key: `line:${line.key}`, line, checked: week.checked.has(line.key) })),
          },
        ]
      : []),
    {
      key: "manual",
      title: "Added by you",
      data: manualItems.map((item): Row => ({ kind: "manual", key: `manual:${item.id}`, item })),
    },
  ];
  const skipped = skippedMealsMessage(week.list.skippedEntries);

  return (
    // SectionList only draws the rows on screen, so long lists stay fast. On iOS it moves
    // its content above the keyboard by itself; Android resizes the screen.
    <SectionList
      sections={sections}
      keyExtractor={(row) => row.key}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={styles.header}>
          <WeekSelector weekStart={weekStart} currentWeekStart={thisWeek} onChange={changeWeek} />
          {skipped ? <FormMessage tone="info" message={skipped} /> : null}
          {writeError ? <FormMessage tone="error" message={writeError} /> : null}
          {week.plannedMeals === 0 ? (
            <EmptyState
              icon="basket-outline"
              title="No meals planned this week"
              description="Plan meals for this week and their ingredients will appear here. You can still add items yourself."
            >
              <SubmitButton label="Open the meal planner" onPress={() => router.navigate("/meal-planner")} />
            </EmptyState>
          ) : null}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {section.title}
        </Text>
      )}
      renderSectionFooter={({ section }) =>
        section.key === "manual" && section.data.length === 0 ? (
          <Text style={styles.emptyNote}>Nothing added yet.</Text>
        ) : null
      }
      renderItem={({ item: row }) =>
        row.kind === "line" ? (
          <GroceryRow
            name={row.line.name}
            amount={amountText(row.line.quantity, row.line.unit)}
            accessibilityLabel={rowAccessibilityLabel(row.line)}
            checked={row.checked}
            onToggle={() => toggleLine(row.line.key, !row.checked)}
            caption={row.line.uncombined ? UNCOMBINED_CAPTION : undefined}
          />
        ) : (
          <GroceryRow
            name={row.item.name}
            amount={amountText(row.item.quantity, row.item.unit)}
            accessibilityLabel={rowAccessibilityLabel(row.item)}
            checked={row.item.checked}
            onToggle={() => toggleItem(row.item)}
            onRemove={() => removeItem(row.item)}
          />
        )
      }
      ListFooterComponent={<AddGroceryItemForm onAdd={addItem} />}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.groupHeading,
    color: colors.action,
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
  },
  emptyNote: {
    ...typography.caption,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },
});
