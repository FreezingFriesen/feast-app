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
  // Firebase's email check can be stricter than signInSchema.
  ["auth/invalid-email", "invalid_credentials"],
  ["auth/requires-recent-login", "requires_recent_login"],
]);

// Codes that mean something different during one call, checked before AUTH_CODES.
const CODES_DURING: Record<"sign_up" | "password_reset", ReadonlyMap<string, AuthErrorCode>> = {
  // All become sign_up_failed, so the answer never says whether the email already has
  // an account.
  sign_up: new Map([
    ["auth/email-already-in-use", "sign_up_failed"],
    ["auth/weak-password", "sign_up_failed"],
    ["auth/invalid-email", "sign_up_failed"],
  ]),
  // A badly formed email says nothing about whether an account exists.
  password_reset: new Map([["auth/invalid-email", "invalid_input"]]),
};

// Maps a Firebase Auth error. Anything not listed is "unknown".
export function authErrorCode(error: unknown, during: "sign_up" | "password_reset" | "other" = "other"): AuthErrorCode {
  const code = firebaseCode(error);
  if (code === undefined) return "unknown";
  const duringCode = during === "other" ? undefined : CODES_DURING[during].get(code);
  return duringCode ?? AUTH_CODES.get(code) ?? "unknown";
}

// True when Firebase Auth says there is no account for the email.
export function isUserNotFound(error: unknown): boolean {
  return firebaseCode(error) === "auth/user-not-found";
}

// True when the Security Rules refused a Firestore call.
export function isPermissionDenied(error: unknown): boolean {
  return firebaseCode(error) === "permission-denied";
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
