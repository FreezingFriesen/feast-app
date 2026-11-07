import type { StoredProfile } from "@/repositories/ProfileRepository";
import { errorCodeIn } from "@/services/domainErrors";
import type { FirebaseClient } from "@/services/firebase/client";
import { firestoreError } from "@/services/firebase/firebaseErrors";
import { firestoreCall, type FirestoreCallOptions } from "@/services/firebase/firestoreCalls";
import { uidSchema, usernameSchema } from "@/validation/authSchema";
import { PROFILE_SCHEMA_VERSION, storedProfileSchema } from "@/validation/profileSchema";
import { deleteDoc, doc, getDocFromServer, writeBatch } from "firebase/firestore";
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
        // Both documents in one atomic write. The Security Rules refuse either one alone.
        const batch = writeBatch(db);
        batch.set(doc(db, "usernames", name), { uid: parsedUid.data });
        batch.set(doc(db, "users", parsedUid.data), profile);
        await firestoreCall(callOptions, () => batch.commit());
        return { ok: true, profile };
      } catch (error) {
        // A refusal means the name is taken, or this user already has a profile.
        return { ok: false, reason: errorCodeIn(firestoreError(error, "taken"), CLAIM_ERRORS) };
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
