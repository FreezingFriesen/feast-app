// Small helpers shared by the recipe and meal plan repositories (in-memory and SQLite).
import { timestampSchema } from "@/validation/authSchema";
import { ID_PATTERN } from "@/validation/patterns";
import { newId } from "./newId";
import type { PendingRecord, RecordCursor } from "./Syncable";

// True if this is a record ID that is safe to store and use in a query or database path.
export const isRecordId = (id: unknown): id is string => typeof id === "string" && ID_PATTERN.test(id);

// True if this is a valid updatedAt (e.g. the one passed to markSynced).
export const isTimestamp = (value: unknown): value is number => timestampSchema.safeParse(value).success;

// A new record ID. A safety check: IDs end up in database paths, so never use one that
// breaks the ID rule.
export function newRecordId(kind: string): string {
  const id = newId();
  if (!isRecordId(id)) {
    throw new Error(`Generated ${kind} ID is invalid`);
  }
  return id;
}

// The updatedAt for an edit. Never moves backwards (e.g. the phone's clock was changed),
// so the edit still wins over the copy it replaces when syncing.
export const nextUpdatedAt = (now: () => number, previous: number) => Math.max(now(), previous + 1);

// Whether an incoming copy replaces the local one. A delete always wins: a deleted copy
// replaces a live one however old it is, and a deleted record is never brought back
// (the Security Rules never let a deleted document become live again, so a live edit
// made after a delete elsewhere could never upload). Otherwise last edit wins, and on a
// tie the local copy stays, so downloading our own upload again never replaces it.
// The SQLite repositories do the same check inside their UPSERT statements.
export function incomingWins(
  local: { updatedAt: number; deletedAt?: number },
  incoming: { updatedAt: number; deletedAt?: number },
): boolean {
  const localDeleted = local.deletedAt !== undefined;
  const incomingDeleted = incoming.deletedAt !== undefined;
  if (incomingDeleted !== localDeleted) return incomingDeleted;
  return incoming.updatedAt > local.updatedAt;
}

// Pending records in upload order: oldest edit first, then by ID.
export function pendingOrder(a: { id: string; updatedAt: number }, b: { id: string; updatedAt: number }): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// True if the record comes after the cursor in upload order.
export const isAfter = (record: { id: string; updatedAt: number }, cursor: RecordCursor) =>
  pendingOrder(record, cursor) > 0;

// One page of pending records, as the in-memory repositories list them (the SQLite ones
// do the same in SQL).
export function pendingPage<T extends { updatedAt: number }>(
  records: PendingRecord<T>[],
  limit: number,
  after?: RecordCursor,
): PendingRecord<T>[] {
  const position = (record: PendingRecord<T>) => ({ id: record.id, updatedAt: record.data.updatedAt });
  return records
    .sort((a, b) => pendingOrder(position(a), position(b)))
    .filter((record) => after === undefined || isAfter(position(record), after))
    .slice(0, limit);
}

// The cursor values for the SQLite repositories' SELECT_PENDING. With no cursor, -1 and ""
// come before every record, so the first page starts at the beginning.
export const pendingCursorParams = (after?: RecordCursor) =>
  after ? [after.updatedAt, after.updatedAt, after.id] : [-1, -1, ""];

// True if `cursor` is a valid listPending cursor.
export const isRecordCursor = (cursor: unknown): cursor is RecordCursor =>
  typeof cursor === "object" &&
  cursor !== null &&
  isRecordId((cursor as RecordCursor).id) &&
  isTimestamp((cursor as RecordCursor).updatedAt);

// The same data without keys whose value is undefined, inside lists and objects too.
// Zod keeps `key: undefined` when the input had the key, and Firestore refuses undefined
// values, so stored records never hold them.
export function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(withoutUndefined) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, field]) => field !== undefined)
        .map(([key, field]) => [key, withoutUndefined(field)]),
    ) as T;
  }
  return value;
}
