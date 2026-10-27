import type { StoredProfile } from "@/repositories/ProfileRepository";
import type { DomainErrorCode } from "@/services/domainErrors";

type RemoteErrorCode = Extract<DomainErrorCode, "offline" | "not_owner" | "invalid_input" | "unknown">;

export type RemoteProfileResult =
  // null: there is no users/{uid} document (e.g. sign up stopped before the username was saved).
  | { ok: true; profile: StoredProfile | null }
  | { ok: false; reason: RemoteErrorCode };

export type RemoteDeleteResult = { ok: true } | { ok: false; reason: RemoteErrorCode };

// The signed-in user's users/{uid} document on the backend, e.g. read after logging in
// on a new device (#19). The full download and upload of changes belongs to the sync engine.
export type RemoteProfileStore = {
  // Only the signed-in user can read their own profile. The downloaded data is untrusted,
  // so it is validated before it is returned; invalid data is reported as unknown.
  fetch(uid: string): Promise<RemoteProfileResult>;
  // Account deletion (N-17). Deleting a profile that's already gone succeeds, so a
  // deletion that failed half way can be retried.
  delete(uid: string): Promise<RemoteDeleteResult>;
};
