// What the sync engine (N-19) needs from a repository of synced records. Each repository
// adds this to its own methods (RecipeRepository = { ... } & Syncable<StoredRecipe>).

// One record waiting to be uploaded. `data` is exactly the document to write under `id`:
// it never holds the ID itself or keys set to undefined (Firestore refuses those).
export type PendingRecord<T> = { id: string; data: T };

// applied: the incoming copy was newer and replaced the local one.
// kept_local: the local copy was as new or newer (last edit wins), or the local copy is
//   deleted and the incoming one isn't (a sync never brings a deleted record back).
// invalid: the incoming ID or data failed validation and nothing was stored.
export type MergeResult = "applied" | "kept_local" | "invalid";

// The most records listPending returns at once (Firestore's batch limit).
export const MAX_PENDING_BATCH = 500;

export type Syncable<T> = {
  // Records changed on this phone and not uploaded yet, deleted ones included, oldest
  // edit first. `limit` must be a whole number from 1 to MAX_PENDING_BATCH, otherwise
  // nothing is returned.
  listPending(limit: number): Promise<PendingRecord<T>[]>;
  // How many records are waiting to be uploaded.
  pendingCount(): Promise<number>;
  // Call after uploading a record. Marks it as uploaded only if its updatedAt is still
  // the one that was uploaded, so an edit made during the upload is uploaded next time.
  // Returns true if it was marked.
  markSynced(id: string, updatedAt: number): Promise<boolean>;
  // A record from outside the phone: sync downloads, restore on a new device. Validated
  // first, then kept only if newer than the local copy. Stored as already uploaded.
  mergeIncoming(id: string, data: unknown): Promise<MergeResult>;
};

// True if `limit` is one listPending accepts.
export const isPendingLimit = (limit: number) =>
  Number.isInteger(limit) && limit >= 1 && limit <= MAX_PENDING_BATCH;
