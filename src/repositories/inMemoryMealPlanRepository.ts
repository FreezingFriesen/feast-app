import {
  dateKeySchema,
  MAX_ENTRIES_PER_SLOT,
  MEAL_PLAN_ENTRY_SCHEMA_VERSION,
  mealPlanEntrySchema,
  mealPlanEntryUpdateSchema,
  storedMealPlanEntrySchema,
  type PlannerMealType,
} from "@/validation/mealPlanSchema";
import type { MealPlanEntry, MealPlanRepository, StoredMealPlanEntry } from "./MealPlanRepository";
import { incomingWins, isRecordId, isTimestamp, newRecordId, nextUpdatedAt, withoutUndefined } from "./records";
import { isPendingLimit } from "./Syncable";

// The meal plan kept in memory: it lasts only while the app is open. Used by tests and by
// RepositoryProvider when no repositories are passed in; the app uses the SQLite version.
// Both pass the same contract tests, so they behave the same.
// "now" is the clock, so tests can control the timestamps.
export function createInMemoryMealPlanRepository(
  now: () => number = Date.now,
): MealPlanRepository {
  // Every entry by ID, including removed ones (they keep their deletedAt).
  const entries = new Map<string, StoredMealPlanEntry>();
  // IDs of entries changed on this "device" and not uploaded yet.
  const pending = new Set<string>();
  // The screens to tell when something changes (see subscribe below).
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((listener) => listener());

  const toEntry = (id: string, data: StoredMealPlanEntry): MealPlanEntry => ({ ...data, id });

  // The entry with this ID, unless it's missing, removed, or the ID isn't a valid one.
  const findLive = (id: string) => {
    if (!isRecordId(id)) return undefined;
    const data = entries.get(id);
    return data?.deletedAt === undefined ? data : undefined;
  };

  // Live entries in a slot, not counting `exceptId` (the entry being moved).
  const countInSlot = (date: string, mealType: PlannerMealType, exceptId?: string) => {
    let count = 0;
    for (const [id, entry] of entries) {
      if (
        entry.deletedAt === undefined &&
        id !== exceptId &&
        entry.date === date &&
        entry.mealType === mealType
      ) {
        count += 1;
      }
    }
    return count;
  };

  // Stores a local change and marks it for upload.
  const saveLocal = (id: string, data: StoredMealPlanEntry) => {
    const saved = withoutUndefined(data);
    entries.set(id, saved);
    pending.add(id);
    notify();
    return toEntry(id, saved);
  };

  return {
    async add(input) {
      // The repository check is the one that counts: validate before every write.
      const result = mealPlanEntrySchema.safeParse(input);
      if (!result.success) {
        return { ok: false, reason: "invalid", error: result.error };
      }

      // Save the cleaned data (result.data), plus the fields the repository sets.
      // The whole record is checked too (e.g. a phone clock set before 2020).
      const timestamp = now();
      const stored = storedMealPlanEntrySchema.safeParse({
        ...result.data,
        createdAt: timestamp,
        updatedAt: timestamp,
        schemaVersion: MEAL_PLAN_ENTRY_SCHEMA_VERSION,
      });
      if (!stored.success) {
        return { ok: false, reason: "invalid", error: stored.error };
      }
      if (countInSlot(stored.data.date, stored.data.mealType) >= MAX_ENTRIES_PER_SLOT) {
        return { ok: false, reason: "slot_full" };
      }
      return { ok: true, entry: saveLocal(newRecordId("meal plan entry"), stored.data) };
    },

    // The patch holds only what changed (date, meal type and/or servings).
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
      // A new updatedAt, so this edit wins over older copies when syncing.
      const merged = storedMealPlanEntrySchema.safeParse({
        ...existing,
        date: parsedPatch.data.date ?? existing.date,
        mealType: parsedPatch.data.mealType ?? existing.mealType,
        servings: parsedPatch.data.servings ?? existing.servings,
        updatedAt: nextUpdatedAt(now, existing.updatedAt),
      });
      if (!merged.success) {
        return { ok: false, reason: "invalid", error: merged.error };
      }
      // The slot is checked only for a move, so an entry in a slot that a download filled
      // past the limit can still be edited where it is.
      const moving = merged.data.date !== existing.date || merged.data.mealType !== existing.mealType;
      if (moving && countInSlot(merged.data.date, merged.data.mealType, id) >= MAX_ENTRIES_PER_SLOT) {
        return { ok: false, reason: "slot_full" };
      }
      return { ok: true, entry: saveLocal(id, merged.data) };
    },

    async remove(id) {
      const existing = findLive(id);
      if (!existing) return false;

      // Soft delete, so a later sync cannot bring the entry back.
      const timestamp = nextUpdatedAt(now, existing.updatedAt);
      const stored = storedMealPlanEntrySchema.safeParse({ ...existing, deletedAt: timestamp, updatedAt: timestamp });
      if (!stored.success) return false;
      saveLocal(id, stored.data);
      return true;
    },

    async listBetween(startDate, endDate) {
      // Invalid dates return nothing rather than an error.
      if (!dateKeySchema.safeParse(startDate).success || !dateKeySchema.safeParse(endDate).success) {
        return [];
      }
      // Date keys are "YYYY-MM-DD", so string comparison is date order.
      return [...entries]
        .filter(
          ([, entry]) =>
            entry.deletedAt === undefined && entry.date >= startDate && entry.date <= endDate,
        )
        .sort(([, a], [, b]) => a.createdAt - b.createdAt)
        .map(([id, entry]) => toEntry(id, entry));
    },

    async getById(id) {
      const data = findLive(id);
      return data ? toEntry(id, data) : undefined;
    },

    async listPending(limit) {
      if (!isPendingLimit(limit)) return [];
      return [...entries]
        .filter(([id]) => pending.has(id))
        .sort(([, a], [, b]) => a.updatedAt - b.updatedAt)
        .slice(0, limit)
        .map(([id, data]) => ({ id, data }));
    },

    async pendingCount() {
      return pending.size;
    },

    async markSynced(id, updatedAt) {
      if (!isRecordId(id) || !isTimestamp(updatedAt)) return false;
      // Only if nothing changed since the upload started.
      if (!pending.has(id) || entries.get(id)?.updatedAt !== updatedAt) return false;
      pending.delete(id);
      return true;
    },

    async mergeIncoming(id, data) {
      if (!isRecordId(id)) return "invalid";
      const result = storedMealPlanEntrySchema.safeParse(data);
      if (!result.success) return "invalid";

      const existing = entries.get(id);
      if (existing && !incomingWins(existing, result.data)) {
        return "kept_local";
      }
      // No slot limit here. The limit is this repository's rule for local edits; the
      // server doesn't enforce it, so refusing a download would leave this phone with a
      // different plan from the others. A slot may end up with more than 10 entries.
      // It came from the server, so there is nothing to upload.
      entries.set(id, withoutUndefined(result.data));
      pending.delete(id);
      notify();
      return "applied";
    },

    async clear() {
      entries.clear();
      pending.clear();
      notify();
    },

    // Screens call this to hear about changes. The function it returns stops listening.
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
