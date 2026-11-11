import { errorCodeIn } from "@/services/domainErrors";
import type { FirebaseClient } from "@/services/firebase/client";
import { firestoreError, isInvalidArgument, isPermissionDenied } from "@/services/firebase/firebaseErrors";
import { firestoreCall, type FirestoreCallOptions } from "@/services/firebase/firestoreCalls";
import { uidSchema } from "@/validation/authSchema";
import {
  fetchChangesOptionsSchema,
  MAX_UPSERT_BATCH,
  recordIdSchema,
  remoteCollectionSchema,
} from "@/validation/syncSchema";
import {
  collection as collectionRef,
  doc,
  documentId,
  getCountFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  where,
  writeBatch,
  type QueryConstraint,
} from "firebase/firestore";
import type {
  FetchChangesResult,
  RemoteCollection,
  RemoteContentStore,
  RemoteCountResult,
  RemoteWriteResult,
} from "./RemoteContentStore";

// The error codes passed on as-is. Anything else becomes "unknown".
const READ_ERRORS = ["offline", "not_owner"] as const;
const WRITE_ERRORS = ["offline"] as const;

type FirebaseRemoteContentStoreDependencies = FirestoreCallOptions & {
  client: Pick<FirebaseClient, "auth" | "db">;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// A failed write: a refusal by the Security Rules is "rejected" (that record will never
// be accepted as it is); data the SDK won't send is "invalid_input"; offline and timeouts
// are "offline"; anything else is "unknown".
function writeFailure(error: unknown): RemoteWriteResult {
  if (isPermissionDenied(error)) return { ok: false, reason: "rejected" };
  if (isInvalidArgument(error)) return { ok: false, reason: "invalid_input" };
  return { ok: false, reason: errorCodeIn(firestoreError(error, "unknown"), WRITE_ERRORS) };
}

// Failures that belong to one record, not the connection: worth retrying one by one.
const isRecordFailure = (error: unknown) => isPermissionDenied(error) || isInvalidArgument(error);

// The user's synced recipes and meal plan entries in Firestore (N-19, #19), under
// users/{uid}/recipes and users/{uid}/mealPlanEntries. Reads come from the server only
// (the cache answers "nothing changed" when offline), and every call goes through
// firestoreCall, so it gives up offline or after the time limit.
export function createFirebaseRemoteContentStore({
  client,
  ...callOptions
}: FirebaseRemoteContentStoreDependencies): RemoteContentStore {
  const { auth, db } = client;

  // Paths are built only from a valid uid, a collection from the fixed list and valid IDs.
  const validPath = (uid: string, collection: RemoteCollection) =>
    uidSchema.safeParse(uid).success && remoteCollectionSchema.safeParse(collection).success;
  const isSignedIn = (uid: string) => auth.currentUser?.uid === uid;

  async function writeOne(uid: string, collection: RemoteCollection, id: string, data: Record<string, unknown>) {
    try {
      await firestoreCall(callOptions, () => setDoc(doc(db, "users", uid, collection, id), data));
      return { ok: true } as const;
    } catch (error) {
      return writeFailure(error);
    }
  }

  async function upsertMany(
    uid: string,
    collection: RemoteCollection,
    records: readonly { id: string; data: Record<string, unknown> }[],
  ): Promise<{ id: string; result: RemoteWriteResult }[]> {
    const everyRecord = (result: RemoteWriteResult) => records.map(({ id }) => ({ id, result }));
    if (!validPath(uid, collection) || records.length > MAX_UPSERT_BATCH) {
      return everyRecord({ ok: false, reason: "invalid_input" });
    }
    // Only the signed-in user's own documents. The Security Rules check this too.
    if (!isSignedIn(uid)) return everyRecord({ ok: false, reason: "not_owner" });

    const isValid = (record: { id: string; data: unknown }) =>
      recordIdSchema.safeParse(record.id).success && isPlainObject(record.data);
    const valid = records.filter(isValid);
    const results = new Map<string, RemoteWriteResult>(
      records.filter((record) => !isValid(record)).map(({ id }) => [id, { ok: false, reason: "invalid_input" }]),
    );

    if (valid.length > 0) {
      try {
        const batch = writeBatch(db);
        valid.forEach(({ id, data }) => batch.set(doc(db, "users", uid, collection, id), data));
        await firestoreCall(callOptions, () => batch.commit());
        valid.forEach(({ id }) => results.set(id, { ok: true }));
      } catch (error) {
        if (!isRecordFailure(error)) {
          const failure = writeFailure(error);
          valid.forEach(({ id }) => results.set(id, failure));
        } else {
          // A batch is all-or-nothing, so one refused record failed them all. Write each
          // one on its own to find out which were refused.
          for (const { id, data } of valid) {
            results.set(id, await writeOne(uid, collection, id, data));
          }
        }
      }
    }
    return records.map(({ id }) => ({ id, result: results.get(id)! }));
  }

  return {
    async fetchChanges(uid, collection, options): Promise<FetchChangesResult> {
      const parsed = fetchChangesOptionsSchema.safeParse(options);
      if (!validPath(uid, collection) || !parsed.success) return { ok: false, reason: "invalid_input" };
      if (!isSignedIn(uid)) return { ok: false, reason: "not_owner" };
      const { since, after, pageSize } = parsed.data;

      // One field and the document ID only, so no composite index is needed. The cursor
      // continues after the last (updatedAt, ID), so more than a page of records with the
      // same updatedAt can't make the download loop.
      const constraints: QueryConstraint[] = [
        where("updatedAt", ">=", since),
        orderBy("updatedAt"),
        orderBy(documentId()),
        ...(after ? [startAfter(after.updatedAt, after.id)] : []),
        limit(pageSize),
      ];
      try {
        const snapshot = await firestoreCall(callOptions, () =>
          getDocsFromServer(query(collectionRef(db, "users", uid, collection), ...constraints)),
        );
        const last = snapshot.docs.at(-1);
        return {
          ok: true,
          documents: snapshot.docs.map((document) => ({ id: document.id, data: document.data() as unknown })),
          next:
            last && snapshot.docs.length === pageSize
              ? { updatedAt: last.get("updatedAt") as number, id: last.id }
              : null,
        };
      } catch (error) {
        return { ok: false, reason: errorCodeIn(firestoreError(error, "not_owner"), READ_ERRORS) };
      }
    },

    async upsert(uid, collection, id, data) {
      const [{ result }] = await upsertMany(uid, collection, [{ id, data }]);
      return result;
    },

    upsertMany,

    async count(uid, collection): Promise<RemoteCountResult> {
      if (!validPath(uid, collection) || !isSignedIn(uid)) return { ok: false };
      try {
        const snapshot = await firestoreCall(callOptions, () =>
          getCountFromServer(collectionRef(db, "users", uid, collection)),
        );
        return { ok: true, count: snapshot.data().count };
      } catch {
        return { ok: false };
      }
    },
  };
}
