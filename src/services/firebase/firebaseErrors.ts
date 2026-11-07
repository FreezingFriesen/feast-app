// Turns Firebase errors into our own codes, so nothing outside the Firebase files ever
// sees a Firebase error. Only error.code is read. error.message can contain the user's
// email, so it is never read, logged or passed on.
import type { AuthErrorCode } from "@/services/auth/AuthService";
import { domainError, isDomainError, type DomainError, type DomainErrorCode } from "@/services/domainErrors";

// The Firebase error code, if there is one.
function firebaseCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}

// Firebase Auth codes, the same for every method.
const AUTH_CODES: ReadonlyMap<string, AuthErrorCode> = new Map([
  ["auth/network-request-failed", "offline"],
  ["auth/too-many-requests", "rate_limited"],
  ["auth/invalid-credential", "invalid_credentials"],
  ["auth/wrong-password", "invalid_credentials"],
  ["auth/user-not-found", "invalid_credentials"],
  ["auth/requires-recent-login", "requires_recent_login"],
]);

// Extra codes during sign up. Both become sign_up_failed, so the answer never says
// whether the email already has an account.
const SIGN_UP_CODES: ReadonlyMap<string, AuthErrorCode> = new Map([
  ["auth/email-already-in-use", "sign_up_failed"],
  ["auth/weak-password", "sign_up_failed"],
]);

// Maps a Firebase Auth error. Anything not listed is "unknown".
export function authErrorCode(error: unknown, during: "sign_up" | "other" = "other"): AuthErrorCode {
  const code = firebaseCode(error);
  if (code === undefined) return "unknown";
  const signUpCode = during === "sign_up" ? SIGN_UP_CODES.get(code) : undefined;
  return signUpCode ?? AUTH_CODES.get(code) ?? "unknown";
}

// True when Firebase Auth says there is no account for the email.
export function isUserNotFound(error: unknown): boolean {
  return firebaseCode(error) === "auth/user-not-found";
}

// Maps a Firestore error to a DomainError. permissionDenied says what a refusal by the
// Security Rules means for this call. DomainErrors (e.g. our own offline check) pass through.
export function firestoreError(error: unknown, permissionDenied: DomainErrorCode): DomainError {
  if (isDomainError(error)) return error;
  switch (firebaseCode(error)) {
    case "permission-denied":
      return domainError(permissionDenied);
    case "unavailable":
    case "deadline-exceeded":
      return domainError("offline");
    default:
      return domainError("unknown");
  }
}
