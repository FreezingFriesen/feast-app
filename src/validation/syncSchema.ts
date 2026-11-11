// src/validation/syncSchema.ts
// Sync (N-19, #19): which collections sync, the limits on reading and writing them, and
// the sync metadata read back from the phone's database.
import { z } from "zod";
import { MAX_TIMESTAMP_MS, storedLoginAtSchema } from "./authSchema";
import { ID_PATTERN } from "./patterns";

// The collections under users/{uid} that sync. Path segments come only from this list.
export const REMOTE_COLLECTIONS = ["recipes", "mealPlanEntries"] as const;
export const remoteCollectionSchema = z.enum(REMOTE_COLLECTIONS);

// Limits. A page read is at most 500 documents; a write batch is at most 100 records.
export const MAX_FETCH_PAGE_SIZE = 500;
export const MAX_UPSERT_BATCH = 100;

// A record ID used in a document path.
export const recordIdSchema = z.string().max(100).regex(ID_PATTERN);

// What a page read asks for: changes with updatedAt >= since, after the cursor (the last
// document of the previous page). The cursor's updatedAt came from the server.
export const fetchChangesOptionsSchema = z.object({
  since: z.number().int().min(0).max(MAX_TIMESTAMP_MS),
  after: z.object({ updatedAt: z.number().finite(), id: recordIdSchema }).optional(),
  pageSize: z.number().int().min(1).max(MAX_FETCH_PAGE_SIZE),
});

// Timestamps in the sync_meta table are decimal text, like the stored login date.
export const storedSyncTimestampSchema = storedLoginAtSchema;
