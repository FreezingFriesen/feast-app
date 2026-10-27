import type { RemoteDeleteResult } from "@/services/profiles/RemoteProfileStore";

// The user's synced content under users/{uid}: recipes and meal plan entries. The sync
// engine will fill it; for now it is only needed to delete an account (N-17).
export type RemoteUserContent = {
  // Deletes all of it (Firestore: in batches of 500 or fewer). Content that is already
  // gone counts as deleted, so a deletion that failed half way can be retried.
  deleteAll(uid: string): Promise<RemoteDeleteResult>;
};
