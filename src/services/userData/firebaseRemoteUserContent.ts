import { errorCodeIn } from "@/services/domainErrors";
import type { FirebaseClient } from "@/services/firebase/client";
import { firestoreError } from "@/services/firebase/firebaseErrors";
import { firestoreCall, type FirestoreCallOptions } from "@/services/firebase/firestoreCalls";
import type { RemoteDeleteResult } from "@/services/profiles/RemoteProfileStore";
import { uidSchema } from "@/validation/authSchema";
import { collection, getDocsFromServer, limit, query, writeBatch } from "firebase/firestore";
import type { RemoteUserContent } from "./RemoteUserContent";

// The error codes passed on as-is. Anything else becomes "unknown".
const REMOTE_ERRORS = ["offline", "not_owner"] as const;

// The most documents one Firestore batch may hold.
export const DELETE_PAGE_SIZE = 500;

// The collections under users/{uid} that hold the user's content.
const CONTENT_COLLECTIONS = ["recipes", "mealPlanEntries"] as const;

type FirebaseRemoteUserContentDependencies = FirestoreCallOptions & {
  client: Pick<FirebaseClient, "auth" | "db">;
};

// The user's recipes and meal plan entries in Firestore.
export function createFirebaseRemoteUserContent({
  client,
  ...callOptions
}: FirebaseRemoteUserContentDependencies): RemoteUserContent {
  const { auth, db } = client;

  // Deletes one collection a page at a time, until the server says it's empty. The page
  // must come from the server: offline, the cache answers "empty" and nothing is deleted.
  async function deleteCollection(uid: string, name: (typeof CONTENT_COLLECTIONS)[number]) {
    const page = query(collection(db, "users", uid, name), limit(DELETE_PAGE_SIZE));
    for (;;) {
      const snapshot = await firestoreCall(callOptions, () => getDocsFromServer(page));
      if (snapshot.empty) return;
      const batch = writeBatch(db);
      snapshot.docs.forEach((document) => batch.delete(document.ref));
      await firestoreCall(callOptions, () => batch.commit());
    }
  }

  return {
    async deleteAll(uid): Promise<RemoteDeleteResult> {
      const parsedUid = uidSchema.safeParse(uid);
      if (!parsedUid.success) return { ok: false, reason: "invalid_input" };
      // Only the signed-in user's own content. The Security Rules check this too.
      if (auth.currentUser?.uid !== parsedUid.data) return { ok: false, reason: "not_owner" };
      try {
        for (const name of CONTENT_COLLECTIONS) {
          await deleteCollection(parsedUid.data, name);
        }
        return { ok: true };
      } catch (error) {
        // Whatever was deleted stays deleted, and running this again finishes the rest.
        return { ok: false, reason: errorCodeIn(firestoreError(error, "not_owner"), REMOTE_ERRORS) };
      }
    },
  };
}
