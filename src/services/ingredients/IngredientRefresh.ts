// Keeps the phone's copy of the ingredient catalog up to date (N-08). A read-only snapshot
// of shared data, so it is separate from recipe and meal plan sync (no last edit wins, no
// uploads). Screens use refreshIfDue only, through "Sync now".

// updated: a new copy was saved. fresh: the copy is less than a day old, nothing to do.
// offline / signed_out: no download was possible. kept_cache: a download was tried but
// not used (see reason), so the copy on the phone stays as it was.
export type RefreshOutcome = "updated" | "fresh" | "offline" | "signed_out" | "kept_cache";

// Why a download wasn't used:
//   incomplete: more pages than allowed without reaching the end
//   too_many: more ingredients than the phone keeps
//   too_many_invalid: more than 10% failed validation
//   none_valid: nothing passed validation
//   failed: the server or the phone's storage failed
export type RefreshKeptReason = "incomplete" | "too_many" | "too_many_invalid" | "none_valid" | "failed";

// Counts only: never shown, never logged, nothing personal.
export type RefreshResult = {
  outcome: RefreshOutcome;
  // Documents that passed validation, and documents skipped (invalid or repeated).
  valid: number;
  skipped: number;
  reason?: RefreshKeptReason;
};

export type IngredientRefresh = {
  // Downloads a new copy if the one on the phone is over a day old (or missing), or
  // always with force. Never rejects.
  refreshIfDue(options?: { force?: boolean }): Promise<RefreshResult>;
};
