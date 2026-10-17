import {
  dateKeySchema,
  MAX_ENTRIES_PER_SLOT,
  mealPlanEntrySchema,
  mealPlanEntryUpdateSchema,
  type PlannerMealType,
} from "@/validation/mealPlanSchema";
import { ID_PATTERN } from "@/validation/patterns";
import type { MealPlanEntry, MealPlanRepository } from "./MealPlanRepository";
import { newId } from "./newId";

const SCHEMA_VERSION = 1;

// Temporary store for Sprint 1: the plan lives only while the app is open.
// Replace with a SQLite implementation of MealPlanRepository for #1.
export function createInMemoryMealPlanRepository(
  now: () => number = Date.now,
): MealPlanRepository {
  const entries = new Map<string, MealPlanEntry>();
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((listener) => listener());

  const findLive = (id: string) => {
    if (!ID_PATTERN.test(id)) return undefined;
    const entry = entries.get(id);
    return entry?.deletedAt === undefined ? entry : undefined;
  };

  // Live entries in a slot, not counting `exceptId` (the entry being moved).
  const countInSlot = (date: string, mealType: PlannerMealType, exceptId?: string) => {
    let count = 0;
    for (const entry of entries.values()) {
      if (
        entry.deletedAt === undefined &&
        entry.id !== exceptId &&
        entry.date === date &&
        entry.mealType === mealType
      ) {
        count += 1;
      }
    }
    return count;
  };

  return {
    async add(input) {
      // The repository check is the one that counts: validate before every write.
      const result = mealPlanEntrySchema.safeParse(input);
      if (!result.success) {
        return { ok: false, reason: "invalid", error: result.error };
      }
      if (countInSlot(result.data.date, result.data.mealType) >= MAX_ENTRIES_PER_SLOT) {
        return { ok: false, reason: "slot_full" };
      }

      const id = newId();
      if (!ID_PATTERN.test(id)) {
        throw new Error("Generated meal plan entry ID is invalid");
      }

      const timestamp = now();
      const entry: MealPlanEntry = {
        ...result.data,
        id,
        createdAt: timestamp,
        updatedAt: timestamp,
        schemaVersion: SCHEMA_VERSION,
      };
      entries.set(id, entry);
      notify();
      return { ok: true, entry };
    },

    async update(id, patch) {
      const existing = findLive(id);
      if (!existing) {
        return { ok: false, reason: "not_found" };
      }
      const parsedPatch = mealPlanEntryUpdateSchema.safeParse(patch);
      if (!parsedPatch.success) {
        return { ok: false, reason: "invalid", error: parsedPatch.error };
      }

      // Validate the merged entry too, so an update can never store an invalid record.
      const merged = mealPlanEntrySchema.safeParse({
        date: parsedPatch.data.date ?? existing.date,
        mealType: parsedPatch.data.mealType ?? existing.mealType,
        recipeId: existing.recipeId,
        servings: parsedPatch.data.servings ?? existing.servings,
      });
      if (!merged.success) {
        return { ok: false, reason: "invalid", error: merged.error };
      }
      if (countInSlot(merged.data.date, merged.data.mealType, id) >= MAX_ENTRIES_PER_SLOT) {
        return { ok: false, reason: "slot_full" };
      }

      const entry: MealPlanEntry = { ...existing, ...merged.data, updatedAt: now() };
      entries.set(id, entry);
      notify();
      return { ok: true, entry };
    },

    async remove(id) {
      const existing = findLive(id);
      if (!existing) return false;

      // Soft delete, so a later sync cannot bring the entry back.
      const timestamp = now();
      entries.set(id, { ...existing, deletedAt: timestamp, updatedAt: timestamp });
      notify();
      return true;
    },

    async listBetween(startDate, endDate) {
      if (!dateKeySchema.safeParse(startDate).success || !dateKeySchema.safeParse(endDate).success) {
        return [];
      }
      // Date keys are "YYYY-MM-DD", so string comparison is date order.
      return [...entries.values()]
        .filter(
          (entry) =>
            entry.deletedAt === undefined && entry.date >= startDate && entry.date <= endDate,
        )
        .sort((a, b) => a.createdAt - b.createdAt);
    },

    async getById(id) {
      return findLive(id);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
