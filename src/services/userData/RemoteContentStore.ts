import type { REMOTE_COLLECTIONS } from "@/validation/syncSchema";

// A collection under users/{uid} that syncs.
export type RemoteCollection = (typeof REMOTE_COLLECTIONS)[number];

// A document as the server returned it. The data is untrusted: the sync engine validates
// it before storing anything.
export type RemoteDocument = { id: string; data: unknown };

// Where a page of documents ends: the last document's updatedAt and ID.
export type RemoteCursor = { updatedAt: number; id: string };

export type FetchChangesOptions = {
  // Documents with updatedAt >= since...
  since: number;
  // ...that come after this document, in (updatedAt, ID) order.
  after?: RemoteCursor;
  // At most MAX_FETCH_PAGE_SIZE.
  pageSize: number;
};

export type FetchChangesResult =
  | { ok: true; documents: RemoteDocument[]; next: RemoteCursor | null }
  | { ok: false; reason: "offline" | "not_owner" | "invalid_input" | "unknown" };

// rejected: the server refused this record (the Security Rules: an older copy than the
// server's, a timestamp too far in the future, or a bad shape). Retrying won't help.
export type RemoteWriteResult =
  | { ok: true }
  | { ok: false; reason: "offline" | "not_owner" | "rejected" | "invalid_input" | "unknown" };

export type RemoteCountResult = { ok: true; count: number } | { ok: false };

// The user's synced recipes and meal plan entries on the server (N-19, #19). The sync
// engine depends on this interface only; implementations are picked in createAppServices.
// Every method checks the uid, collection and IDs before building a path, reads from the
// server (never a cache), and returns results instead of throwing.
export type RemoteContentStore = {
  // One page of documents changed since `since`, oldest updatedAt first. `next` is the
  // cursor for the following page, or null when this was the last one.
  fetchChanges(uid: string, collection: RemoteCollection, options: FetchChangesOptions): Promise<FetchChangesResult>;
  // Writes one document (create or replace). `data` must already be the exact document.
  upsert(uid: string, collection: RemoteCollection, id: string, data: Record<string, unknown>): Promise<RemoteWriteResult>;
  // Writes up to MAX_UPSERT_BATCH documents. Each record gets its own result, so one
  // refused record doesn't fail the others.
  upsertMany(
    uid: string,
    collection: RemoteCollection,
    records: readonly { id: string; data: Record<string, unknown> }[],
  ): Promise<{ id: string; result: RemoteWriteResult }[]>;
  // How many documents the collection holds (for restore progress only).
  count(uid: string, collection: RemoteCollection): Promise<RemoteCountResult>;
};
