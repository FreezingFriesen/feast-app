import { errorCodeIn } from "@/services/domainErrors";
import type { FirebaseClient } from "@/services/firebase/client";
import { firestoreError } from "@/services/firebase/firebaseErrors";
import { firestoreCall, type FirestoreCallOptions } from "@/services/firebase/firestoreCalls";
import { uidSchema } from "@/validation/authSchema";
import { storedProfileSchema } from "@/validation/profileSchema";
import { deleteDoc, doc, getDocFromServer } from "firebase/firestore";
import type { RemoteDeleteResult, RemoteProfileResult, RemoteProfileStore } from "./RemoteProfileStore";

// The error codes passed on as-is. Anything else becomes "unknown".
const REMOTE_ERRORS = ["offline", "not_owner"] as const;

type FirebaseRemoteProfileStoreDependencies = FirestoreCallOptions & {
  client: Pick<FirebaseClient, "db">;
};

// users/{uid} in Firestore. The Security Rules allow only the owner, and allow the
// delete only once the username has been released.
export function createFirebaseRemoteProfileStore({
  client,
  ...callOptions
}: FirebaseRemoteProfileStoreDependencies): RemoteProfileStore {
  const { db } = client;

  return {
    async fetch(uid): Promise<RemoteProfileResult> {
      const parsedUid = uidSchema.safeParse(uid);
      if (!parsedUid.success) return { ok: false, reason: "invalid_input" };
      try {
        const snapshot = await firestoreCall(callOptions, () => getDocFromServer(doc(db, "users", parsedUid.data)));
        if (!snapshot.exists()) return { ok: true, profile: null };
        // Downloaded data is untrusted: only the parsed result is handed back.
        const parsed = storedProfileSchema.safeParse(snapshot.data());
        return parsed.success ? { ok: true, profile: parsed.data } : { ok: false, reason: "unknown" };
      } catch (error) {
        return { ok: false, reason: errorCodeIn(firestoreError(error, "not_owner"), REMOTE_ERRORS) };
      }
    },

    async delete(uid): Promise<RemoteDeleteResult> {
      const parsedUid = uidSchema.safeParse(uid);
      if (!parsedUid.success) return { ok: false, reason: "invalid_input" };
      try {
        // Deleting a profile that's already gone succeeds, so account deletion can be retried.
        await firestoreCall(callOptions, () => deleteDoc(doc(db, "users", parsedUid.data)));
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: errorCodeIn(firestoreError(error, "not_owner"), REMOTE_ERRORS) };
      }
    },
  };
}
