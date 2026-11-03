import type { z } from "zod";
import type { mealPlanEntrySchema } from "@/validation/mealPlanSchema";

// The cleaned, validated entry fields (output of mealPlanEntrySchema).
export type MealPlanEntryData = z.output<typeof mealPlanEntrySchema>;

// One recipe placed in one slot (date + meal type). Each entry is its own record,
// so last-edit-wins sync works per entry rather than per week.
// The extra fields are set by the repository, never by the user. Timestamps are in
// milliseconds. deletedAt is only set once the entry is removed (soft delete), and
// schemaVersion says which version of the data format the record uses.
export type MealPlanEntry = MealPlanEntryData & {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  schemaVersion: number;
};

// What add() and update() return: the saved entry, or why it wasn't saved
// (invalid data, a full slot, or an entry that no longer exists).
export type MealPlanWriteResult =
  | { ok: true; entry: MealPlanEntry }
  | { ok: false; reason: "invalid"; error: z.ZodError }
  | { ok: false; reason: "slot_full" | "not_found" };

// Screens depend on this interface only. Implementations (in-memory now,
// SQLite + Firestore sync later) are swapped in through RepositoryProvider.
export type MealPlanRepository = {
  // Validates the input with mealPlanEntrySchema before writing.
  add(input: unknown): Promise<MealPlanWriteResult>;
  // Moves an entry or changes its servings. Validates the patch and the merged entry.
  update(id: string, patch: unknown): Promise<MealPlanWriteResult>;
  // Soft delete (sets deletedAt). Returns false if the entry was not found.
  remove(id: string): Promise<boolean>;
  // Entries from startDate to endDate (inclusive, "YYYY-MM-DD"), not soft-deleted, oldest first.
  listBetween(startDate: string, endDate: string): Promise<MealPlanEntry[]>;
  // One entry, or undefined if it doesn't exist or was removed.
  getById(id: string): Promise<MealPlanEntry | undefined>;
  // Removes every entry from this device (logout wipe, account deletion).
  clear(): Promise<void>;
  // Calls the listener after every change. Returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
};
