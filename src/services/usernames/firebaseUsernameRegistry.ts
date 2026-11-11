import type { StoredProfile } from "@/repositories/ProfileRepository";
import { errorCodeIn } from "@/services/domainErrors";
import type { FirebaseClient } from "@/services/firebase/client";
import { firestoreError, isPermissionDenied } from "@/services/firebase/firebaseErrors";
import { firestoreCall, type FirestoreCallOptions } from "@/services/firebase/firestoreCalls";
import { uidSchema, usernameSchema } from "@/validation/authSchema";
import { PROFILE_SCHEMA_VERSION, storedProfileSchema } from "@/validation/profileSchema";
import { deleteDoc, doc, getDocFromServer, runTransaction } from "firebase/firestore";
import type {
  UsernameAvailability,
  UsernameClaimResult,
  UsernameRegistry,
  UsernameReleaseResult,
} from "./UsernameRegistry";

// The error codes each method passes on as-is. Anything else becomes "unknown".
const AVAILABILITY_ERRORS = ["offline"] as const;
const CLAIM_ERRORS = ["offline", "taken", "not_owner", "invalid_input"] as const;
const RELEASE_ERRORS = ["offline", "not_owner", "invalid_input"] as const;

type FirebaseUsernameRegistryDependencies = FirestoreCallOptions & {
  client: Pick<FirebaseClient, "auth" | "db">;
  // Timestamps are whole milliseconds from this clock. The Security Rules require integers.
  now?: () => number;
};

// usernames/{name} and users/{uid} in Firestore. The Security Rules are the guarantee:
// a name has one owner, and each user has one name. Names are only ever read one at a
// time, never listed.
export function createFirebaseUsernameRegistry({
  client,
  now = Date.now,
  ...callOptions
}: FirebaseUsernameRegistryDependencies): UsernameRegistry {
  const { auth, db } = client;

  return {
    async isAvailable(username): Promise<UsernameAvailability> {
      // usernameSchema lowercases, so "Levi" and "levi" are the same name.
      const parsed = usernameSchema.safeParse(username);
      if (!parsed.success) return "invalid_input";
      try {
        const snapshot = await firestoreCall(callOptions, () => getDocFromServer(doc(db, "usernames", parsed.data)));
        return snapshot.exists() ? "taken" : "available";
      } catch (error) {
        return errorCodeIn(firestoreError(error, "unknown"), AVAILABILITY_ERRORS);
      }
    },

    async claim(uid, username): Promise<UsernameClaimResult> {
      const parsedUid = uidSchema.safeParse(uid);
      const parsedName = usernameSchema.safeParse(username);
      if (!parsedUid.success || !parsedName.success) return { ok: false, reason: "invalid_input" };
      if (auth.currentUser?.uid !== parsedUid.data) return { ok: false, reason: "not_owner" };
      const name = parsedName.data;
      const nameRef = doc(db, "usernames", name);
      const userRef = doc(db, "users", parsedUid.data);

      try {
        // The new user's profile: the username, and no dietary restrictions set yet.
        const timestamp = now();
        const profile: StoredProfile = storedProfileSchema.parse({
          username: name,
          dietaryRestrictions: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          schemaVersion: PROFILE_SCHEMA_VERSION,
        });
        // A transaction, not a batch: it goes straight to the server instead of the SDK's
        // write queue, so a claim that timed out can't land whenever the phone next
        // reconnects. Both documents are written together, because the Security Rules
        // refuse either one alone.
        const claimed = await firestoreCall(callOptions, () =>
          runTransaction(db, async (transaction) => {
            const [nameDoc, userDoc] = await Promise.all([transaction.get(nameRef), transaction.get(userRef)]);
            // One username per user, and each name has one owner.
            if (nameDoc.exists() || userDoc.exists()) return false;
            transaction.set(nameRef, { uid: parsedUid.data });
            transaction.set(userRef, profile);
            return true;
          }),
        );
        return claimed ? { ok: true, profile } : { ok: false, reason: "taken" };
      } catch (error) {
        if (!isPermissionDenied(error)) {
          return { ok: false, reason: errorCodeIn(firestoreError(error, "unknown"), CLAIM_ERRORS) };
        }
        // Refused: usually another user claimed the name between our read and our write.
        // Anything else (e.g. a phone clock more than 5 minutes fast) isn't "taken".
        try {
          const snapshot = await firestoreCall(callOptions, () => getDocFromServer(nameRef));
          const owner = snapshot.exists() ? snapshot.get("uid") : undefined;
          return { ok: false, reason: owner !== undefined && owner !== parsedUid.data ? "taken" : "unknown" };
        } catch (rereadError) {
          return { ok: false, reason: errorCodeIn(firestoreError(rereadError, "unknown"), CLAIM_ERRORS) };
        }
      }
    },

    async release(uid, username): Promise<UsernameReleaseResult> {
      const parsedUid = uidSchema.safeParse(uid);
      const parsedName = usernameSchema.safeParse(username);
      if (!parsedUid.success || !parsedName.success) return { ok: false, reason: "invalid_input" };
      // Without this, the signed-in user could free their own name while passing someone else's uid.
      if (auth.currentUser?.uid !== parsedUid.data) return { ok: false, reason: "not_owner" };

      try {
        // Deleting a name that's already free succeeds, so account deletion can be retried.
        await firestoreCall(callOptions, () => deleteDoc(doc(db, "usernames", parsedName.data)));
        return { ok: true };
      } catch (error) {
        // A refusal means another user owns the name.
        return { ok: false, reason: errorCodeIn(firestoreError(error, "not_owner"), RELEASE_ERRORS) };
      }
    },
  };
}
