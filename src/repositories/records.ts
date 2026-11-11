// Small helpers shared by the recipe and meal plan repositories (in-memory and SQLite).
import { timestampSchema } from "@/validation/authSchema";
import { ID_PATTERN } from "@/validation/patterns";
import { newId } from "./newId";

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

// Last edit wins: an incoming copy replaces the local one only if it is newer. On a tie
// the local copy stays, so downloading our own upload again never replaces it. A deleted
// record is never brought back, even by a newer copy that isn't deleted.
// The SQLite repositories do the same check inside their UPSERT statements.
export function incomingWins(
  local: { updatedAt: number; deletedAt?: number },
  incoming: { updatedAt: number; deletedAt?: number },
): boolean {
  return (
    incoming.updatedAt > local.updatedAt &&
    (local.deletedAt === undefined || incoming.deletedAt !== undefined)
  );
}

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
