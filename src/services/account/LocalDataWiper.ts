import { domainError } from "@/services/domainErrors";

// Removes the signed-in user's data from this device (logout, account deletion).
export type LocalDataWiper = {
  wipe(): Promise<void>;
};

type Clearable = { clear(): Promise<void> };

// Built from each local repository's clear(). One failing store doesn't stop the
// others, so as little as possible is left behind; any failure is then reported
// as storage_failed.
export function createLocalDataWiper(stores: readonly Clearable[]): LocalDataWiper {
  return {
    async wipe() {
      const results = await Promise.allSettled(stores.map((store) => store.clear()));
      if (results.some((result) => result.status === "rejected")) {
        throw domainError("storage_failed");
      }
    },
  };
}
