// One sync run (N-19, #19): check whose data this is, download each collection, then
// upload what changed on the phone. Download comes first: the Security Rules refuse an
// upload over a newer server copy, so the newer copy has to be merged first.
import { isRecordId, withoutUndefined } from "@/repositories/records";
import { MAX_PENDING_BATCH, type RecordCursor, type Syncable } from "@/repositories/Syncable";
import type { RemoteCollection, RemoteContentStore, RemoteCursor } from "@/services/userData/RemoteContentStore";
import { toRemoteDocument } from "@/services/userData/remoteDocuments";
import { MAX_FETCH_PAGE_SIZE, MAX_UPSERT_BATCH } from "@/validation/syncSchema";
import type { SyncMetaStore } from "./SyncMetaStore";

// Each download starts this far before the newest updatedAt already downloaded.
// updatedAt comes from phone clocks, so a phone whose clock is behind can upload a change
// whose updatedAt is older than ones already downloaded; re-reading the last hour catches
// those. Merging is idempotent, so re-reading costs only the reads.
export const DOWNLOAD_OVERLAP_MS = 60 * 60 * 1000;

// One collection that syncs: its name on the server, the local repository, and the
// stored-record check every upload goes through first.
export type SyncedCollection = {
  name: RemoteCollection;
  repository: Syncable<{ updatedAt: number }>;
  validate(data: unknown): Record<string, unknown> | undefined;
};

// Counts from one run. Never contains record content.
export type SyncReport = {
  downloaded: number;
  applied: number;
  // Downloaded documents that failed validation (or had a bad ID): not stored.
  skipped: number;
  uploaded: number;
  // Records the server refused, or that failed validation before upload: still pending.
  rejected: number;
};

export type SyncOutcome = "done" | "offline" | "failed" | "other_account" | "stopped";

type SyncRunDependencies = {
  uid: string;
  remote: RemoteContentStore;
  meta: SyncMetaStore;
  collections: readonly SyncedCollection[];
  // False once this run must stop: the user changed, signed out, or sync was stopped.
  // Checked before every write, local or remote.
  stillCurrent(): boolean;
  // Restore progress while downloading to an empty phone, then null.
  onRestoreProgress(restore: { completed: number; total: number | null } | null): void;
  // Called once the downloads are done and uploading begins.
  onUploadStart(): void;
};

// Where a step stopped, if it didn't finish.
type StepResult = "ok" | "offline" | "failed" | "stopped";

export async function runSync({
  uid,
  remote,
  meta,
  collections,
  stillCurrent,
  onRestoreProgress,
  onUploadStart,
}: SyncRunDependencies): Promise<{ outcome: SyncOutcome; report: SyncReport }> {
  const report: SyncReport = { downloaded: 0, applied: 0, skipped: 0, uploaded: 0, rejected: 0 };
  const finish = (outcome: SyncOutcome) => ({ outcome, report });

  // Whose data is this? Data made while signed out belongs to nobody, and the first user
  // to sign in adopts it. Another account's data is never merged or uploaded.
  const saved = await meta.read();
  if (!stillCurrent()) return finish("stopped");
  if (saved.ownerUid !== null && saved.ownerUid !== uid) return finish("other_account");
  if (saved.ownerUid === null) await meta.setOwner(uid);

  // A collection never downloaded before is restored from the start. Progress is shown
  // only when there is something to restore.
  const restoring = collections.filter(({ name }) => saved.highWater[name] === null);
  let restore: { completed: number; total: number | null } | null = null;
  if (restoring.length > 0) {
    const counts = await Promise.all(restoring.map(({ name }) => remote.count(uid, name)));
    const total = counts.every((count) => count.ok)
      ? counts.reduce((sum, count) => sum + (count.ok ? count.count : 0), 0)
      : null;
    if (total !== 0 && stillCurrent()) {
      restore = { completed: 0, total };
      onRestoreProgress(restore);
    }
  }

  // Download one collection page by page, merging each document (last edit wins; a delete
  // always wins). The high-water mark moves on only after a page is merged, and only to
  // updatedAt values the server returned, never the phone's clock.
  async function download({ name, repository }: SyncedCollection): Promise<StepResult> {
    let highWater = saved.highWater[name];
    const since = highWater === null ? 0 : Math.max(0, highWater - DOWNLOAD_OVERLAP_MS);
    const counted = restore !== null && restoring.some((collection) => collection.name === name);
    let after: RemoteCursor | undefined;
    for (;;) {
      if (!stillCurrent()) return "stopped";
      const page = await remote.fetchChanges(uid, name, { since, after, pageSize: MAX_FETCH_PAGE_SIZE });
      if (!page.ok) return page.reason === "offline" ? "offline" : "failed";

      for (const document of page.documents) {
        if (!stillCurrent()) return "stopped";
        report.downloaded += 1;
        // Untrusted: a bad ID or invalid data is skipped and counted, never stored.
        const result = isRecordId(document.id) ? await repository.mergeIncoming(document.id, document.data) : "invalid";
        if (result === "invalid") report.skipped += 1;
        if (result === "applied") report.applied += 1;
        if (counted && restore && stillCurrent()) {
          restore = { ...restore, completed: restore.completed + 1 };
          onRestoreProgress(restore);
        }
      }

      const pageNewest = Math.max(
        ...page.documents.map(({ data }) => (data as { updatedAt?: unknown } | null)?.updatedAt).filter(isFiniteNumber),
      );
      if (Number.isFinite(pageNewest) && (highWater === null || pageNewest > highWater)) {
        if (!stillCurrent()) return "stopped";
        highWater = pageNewest;
        await meta.setHighWater(name, highWater);
      }
      if (!page.next) return "ok";
      after = page.next;
    }
  }

  // Upload one collection's pending records, oldest edit first, in batches. A refused
  // record stays pending and is counted, and the queue moves past it, so it never blocks
  // the records behind it.
  async function upload({ name, repository, validate }: SyncedCollection): Promise<StepResult> {
    let after: RecordCursor | undefined;
    for (;;) {
      if (!stillCurrent()) return "stopped";
      const page = await repository.listPending(MAX_PENDING_BATCH, after);
      if (page.length === 0) return "ok";
      const last = page[page.length - 1];
      after = { updatedAt: last.data.updatedAt, id: last.id };

      for (let start = 0; start < page.length; start += MAX_UPSERT_BATCH) {
        // Checked again before upload, then built from the allowed keys only.
        const batch = page.slice(start, start + MAX_UPSERT_BATCH).flatMap((record) => {
          const valid = validate(record.data);
          if (!valid) {
            report.rejected += 1;
            return [];
          }
          return [{ id: record.id, updatedAt: record.data.updatedAt, data: toRemoteDocument(name, withoutUndefined(valid)) }];
        });
        if (batch.length === 0) continue;
        if (!stillCurrent()) return "stopped";

        const results = await remote.upsertMany(uid, name, batch);
        let stopWith: StepResult = "ok";
        for (const { id, result } of results) {
          if (result.ok) {
            if (!stillCurrent()) return "stopped";
            // Only if it wasn't edited during the upload; otherwise it goes next time.
            const record = batch.find((item) => item.id === id);
            if (record) await repository.markSynced(id, record.updatedAt);
            report.uploaded += 1;
          } else if (result.reason === "rejected" || result.reason === "invalid_input") {
            report.rejected += 1;
          } else {
            stopWith = result.reason === "offline" ? "offline" : "failed";
          }
        }
        if (stopWith !== "ok") return stopWith;
      }
      if (page.length < MAX_PENDING_BATCH) return "ok";
    }
  }

  for (const collection of collections) {
    const result = await download(collection);
    if (result !== "ok") return finish(result);
  }
  if (restore !== null && stillCurrent()) onRestoreProgress(null);

  onUploadStart();
  for (const collection of collections) {
    const result = await upload(collection);
    if (result !== "ok") return finish(result);
  }
  return finish("done");
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
