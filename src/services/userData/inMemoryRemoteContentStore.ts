import type { InMemoryServer } from "@/services/backend/inMemoryServer";
import { errorCodeIn } from "@/services/domainErrors";
import { uidSchema } from "@/validation/authSchema";
import { storedMealPlanEntrySchema } from "@/validation/mealPlanSchema";
import { storedRecipeSchema } from "@/validation/recipeSchema";
import {
  fetchChangesOptionsSchema,
  MAX_UPSERT_BATCH,
  recordIdSchema,
  remoteCollectionSchema,
} from "@/validation/syncSchema";
import type {
  FetchChangesResult,
  RemoteCollection,
  RemoteContentStore,
  RemoteCountResult,
  RemoteDocument,
  RemoteWriteResult,
} from "./RemoteContentStore";
import { hasAllowedKeys } from "./remoteDocuments";

// The only error code passed on as-is. Anything else becomes "unknown".
const REMOTE_ERRORS = ["offline"] as const;

// How far in the future a timestamp may be (validTimestamp in firestore.rules).
const MAX_CLOCK_AHEAD_MS = 5 * 60 * 1000;

const STORED_SCHEMAS = { recipes: storedRecipeSchema, mealPlanEntries: storedMealPlanEntrySchema };

type StoredDocument = Record<string, unknown>;

// Documents are copied in and out, like data crossing a network.
const copy = (data: StoredDocument): StoredDocument => JSON.parse(JSON.stringify(data));

const isPlainObject = (value: unknown): value is StoredDocument =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Would firestore.rules accept this write? The same checks: exactly the allowed keys,
// valid values (our stored schema, which is stricter inside lists), timestamps at most 5
// minutes ahead of the server's clock and, when replacing a document, a newer or equal
// updatedAt, the same createdAt, a deletedAt that is kept, and (entries) the same recipe.
function rulesAllow(
  collection: RemoteCollection,
  existing: StoredDocument | undefined,
  incoming: StoredDocument,
  serverNow: number,
): boolean {
  if (!hasAllowedKeys(collection, incoming)) return false;
  if (!STORED_SCHEMAS[collection].safeParse(incoming).success) return false;
  for (const key of ["createdAt", "updatedAt", "deletedAt"]) {
    const value = incoming[key];
    if (typeof value === "number" && value > serverNow + MAX_CLOCK_AHEAD_MS) return false;
  }
  if (!existing) return true;
  return (
    (incoming.updatedAt as number) >= (existing.updatedAt as number) &&
    incoming.createdAt === existing.createdAt &&
    (existing.deletedAt === undefined || incoming.deletedAt === existing.deletedAt) &&
    (collection !== "mealPlanEntries" || incoming.recipeId === existing.recipeId)
  );
}

// (updatedAt, ID) order, the order Firestore returns them in.
function documentOrder(a: { id: string; updatedAt: number }, b: { id: string; updatedAt: number }): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Development backend: users/{uid}/recipes and users/{uid}/mealPlanEntries on the
// in-memory server, shared by every simulated phone on that server.
export function createInMemoryRemoteContentStore(server: InMemoryServer): RemoteContentStore {
  const validPath = (uid: string, collection: RemoteCollection) =>
    uidSchema.safeParse(uid).success && remoteCollectionSchema.safeParse(collection).success;

  // The user's documents in one collection, by ID.
  function documentsIn(uid: string, collection: RemoteCollection): Map<string, StoredDocument> {
    const prefix = `${collection}/`;
    const result = new Map<string, StoredDocument>();
    for (const [path, data] of server.state.userContent.get(uid) ?? []) {
      if (path.startsWith(prefix)) result.set(path.slice(prefix.length), data);
    }
    return result;
  }

  // Applies one write if the rules allow it. Runs inside a server call.
  function write(uid: string, collection: RemoteCollection, id: string, data: unknown): RemoteWriteResult {
    if (!recordIdSchema.safeParse(id).success || !isPlainObject(data)) return { ok: false, reason: "invalid_input" };
    const path = `${collection}/${id}`;
    const documents = server.state.userContent.get(uid) ?? new Map<string, StoredDocument>();
    if (!rulesAllow(collection, documents.get(path), data, server.now())) return { ok: false, reason: "rejected" };
    documents.set(path, copy(data));
    server.state.userContent.set(uid, documents);
    return { ok: true };
  }

  async function writeAll(
    uid: string,
    collection: RemoteCollection,
    records: readonly { id: string; data: unknown }[],
  ): Promise<{ id: string; result: RemoteWriteResult }[]> {
    const everyRecord = (result: RemoteWriteResult) => records.map(({ id }) => ({ id, result }));
    if (!validPath(uid, collection) || records.length > MAX_UPSERT_BATCH) {
      return everyRecord({ ok: false, reason: "invalid_input" });
    }
    try {
      return await server.run("content.write", () => {
        // Least privilege, like the Security Rules: only your own documents.
        if (server.signedInUid !== uid) return everyRecord({ ok: false, reason: "not_owner" });
        return records.map(({ id, data }) => ({ id, result: write(uid, collection, id, data) }));
      });
    } catch (error) {
      return everyRecord({ ok: false, reason: errorCodeIn(error, REMOTE_ERRORS) });
    }
  }

  return {
    async fetchChanges(uid, collection, options): Promise<FetchChangesResult> {
      const parsed = fetchChangesOptionsSchema.safeParse(options);
      if (!validPath(uid, collection) || !parsed.success) return { ok: false, reason: "invalid_input" };
      const { since, after, pageSize } = parsed.data;
      try {
        return await server.run("content.fetch", (): FetchChangesResult => {
          if (server.signedInUid !== uid) return { ok: false, reason: "not_owner" };
          // Like where("updatedAt", ">=", since): only documents with a number there.
          const page = [...documentsIn(uid, collection)]
            .flatMap(([id, data]) =>
              typeof data.updatedAt === "number" && data.updatedAt >= since ? [{ id, updatedAt: data.updatedAt, data }] : [],
            )
            .sort(documentOrder)
            .filter((document) => after === undefined || documentOrder(document, after) > 0)
            .slice(0, pageSize);
          const documents: RemoteDocument[] = page.map(({ id, data }) => ({ id, data: copy(data) }));
          const last = page.at(-1);
          return {
            ok: true,
            documents,
            next: last && page.length === pageSize ? { updatedAt: last.updatedAt, id: last.id } : null,
          };
        });
      } catch (error) {
        return { ok: false, reason: errorCodeIn(error, REMOTE_ERRORS) };
      }
    },

    async upsert(uid, collection, id, data) {
      const [{ result }] = await writeAll(uid, collection, [{ id, data }]);
      return result;
    },

    upsertMany: writeAll,

    async count(uid, collection): Promise<RemoteCountResult> {
      if (!validPath(uid, collection)) return { ok: false };
      try {
        return await server.run("content.count", (): RemoteCountResult =>
          server.signedInUid === uid ? { ok: true, count: documentsIn(uid, collection).size } : { ok: false },
        );
      } catch {
        return { ok: false };
      }
    },
  };
}
