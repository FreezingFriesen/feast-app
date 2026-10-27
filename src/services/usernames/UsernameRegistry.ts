import type { StoredProfile } from "@/repositories/ProfileRepository";
import type { DomainErrorCode } from "@/services/domainErrors";

export type UsernameAvailability =
  | "available"
  | Extract<DomainErrorCode, "taken" | "invalid_input" | "offline" | "unknown">;

export type UsernameClaimResult =
  // profile: the users/{uid} record created with the claim, for ProfileRepository.mergeIncoming
  | { ok: true; profile: StoredProfile }
  // taken: someone else has the name, or this user already has a username.
  // not_owner: uid is not the signed-in user.
  | { ok: false; reason: Extract<DomainErrorCode, "taken" | "not_owner" | "invalid_input" | "offline" | "unknown"> };

export type UsernameReleaseResult =
  | { ok: true }
  | { ok: false; reason: Extract<DomainErrorCode, "not_owner" | "invalid_input" | "offline" | "unknown"> };

// Usernames are unique, case-insensitive display names (login is by email).
// The guarantee is the usernames/{username} document and its Security Rules,
// not the availability check. Anything thrown is a DomainError.
export type UsernameRegistry = {
  // Live feedback while typing. Someone else can still claim the name before claim() runs.
  isAvailable(username: unknown): Promise<UsernameAvailability>;
  // Claims the username for uid and creates the user's profile record in one atomic
  // write: afterwards either both exist or neither does.
  claim(uid: string, username: unknown): Promise<UsernameClaimResult>;
  // Frees the username. Only its owner can release it. Releasing a name that is no
  // longer claimed succeeds, so a failed account deletion can be retried.
  release(uid: string, username: string): Promise<UsernameReleaseResult>;
};
