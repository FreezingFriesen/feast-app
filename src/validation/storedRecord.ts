// src/validation/storedRecord.ts
// The fields every synced record (recipes, meal plan entries) carries once it is saved.
// Mirror validRecordFields in firestore.rules.
import { z } from "zod";
import { timestampSchema } from "./authSchema";

// Set by the repository, never by the user. deletedAt is only there once the record is
// deleted (soft delete). The record's ID is not a field: it is the document ID.
export function storedRecordFields<V extends number>(schemaVersion: V) {
  return {
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    deletedAt: timestampSchema.optional(),
    schemaVersion: z.literal(schemaVersion),
  };
}

// An edit can't come before the record was created.
export const datesInOrder = (record: { createdAt: number; updatedAt: number }) =>
  record.updatedAt >= record.createdAt;

export const DATES_IN_ORDER_ISSUE = { path: ["updatedAt"], message: "updatedAt is before createdAt" };

// Lists read back from storage or sync: the Security Rules reject duplicates, so we do too.
export const noDuplicates = (values: readonly string[]) => new Set(values).size === values.length;
