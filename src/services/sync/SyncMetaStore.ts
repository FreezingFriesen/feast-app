import type { RemoteCollection } from "@/services/userData/RemoteContentStore";

// What the phone remembers about syncing (N-19). Wiped with the rest of the local data.
export type SyncMeta = {
  // The account the local recipes and meal plans belong to; null = nobody yet (made
  // while signed out), so the next user to sign in adopts them.
  ownerUid: string | null;
  // The newest updatedAt downloaded from the server for each collection; null = never
  // downloaded, so the next download is a full restore.
  highWater: Record<RemoteCollection, number | null>;
  // When the last sync finished with nothing refused or failed.
  lastSyncedAt: number | null;
};

// Each setter ignores a value that isn't valid, rather than storing it.
export type SyncMetaStore = {
  read(): Promise<SyncMeta>;
  setOwner(uid: string): Promise<void>;
  setHighWater(collection: RemoteCollection, updatedAt: number): Promise<void>;
  setLastSyncedAt(timestamp: number): Promise<void>;
  // Forgets everything (logout wipe, account deletion).
  clear(): Promise<void>;
};
