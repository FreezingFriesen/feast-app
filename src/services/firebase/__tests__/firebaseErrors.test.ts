import { DOMAIN_ERROR_CODES, domainError, isDomainError } from "@/services/domainErrors";
import { authErrorCode, firestoreError, isPermissionDenied, isUserNotFound } from "../firebaseErrors";

describe("authErrorCode", () => {
  it.each([
    ["auth/network-request-failed", "offline"],
    ["auth/too-many-requests", "rate_limited"],
    ["auth/invalid-credential", "invalid_credentials"],
    ["auth/wrong-password", "invalid_credentials"],
    ["auth/user-not-found", "invalid_credentials"],
    ["auth/invalid-email", "invalid_credentials"],
    ["auth/requires-recent-login", "requires_recent_login"],
    // Only sign up gives these a meaning.
    ["auth/email-already-in-use", "unknown"],
    ["auth/weak-password", "unknown"],
    // Anything not listed
    ["auth/user-disabled", "unknown"],
    ["auth/internal-error", "unknown"],
    ["permission-denied", "unknown"],
    ["constructor", "unknown"],
    ["toString", "unknown"],
  ])("%s -> %s", (code, expected) => {
    expect(authErrorCode({ code })).toBe(expected);
  });

  it.each([
    ["auth/email-already-in-use", "sign_up_failed"],
    ["auth/weak-password", "sign_up_failed"],
    ["auth/invalid-email", "sign_up_failed"],
    ["auth/network-request-failed", "offline"],
    ["auth/too-many-requests", "rate_limited"],
    ["auth/operation-not-allowed", "unknown"],
  ])("during sign up, %s -> %s", (code, expected) => {
    expect(authErrorCode({ code }, "sign_up")).toBe(expected);
  });

  it.each([
    ["auth/invalid-email", "invalid_input"],
    ["auth/user-not-found", "invalid_credentials"],
    ["auth/network-request-failed", "offline"],
    ["auth/too-many-requests", "rate_limited"],
    ["auth/email-already-in-use", "unknown"],
  ])("during password reset, %s -> %s", (code, expected) => {
    expect(authErrorCode({ code }, "password_reset")).toBe(expected);
  });

  it.each([new Error("network"), { code: 42 }, {}, "auth/wrong-password", null, undefined])(
    "treats %p as unknown",
    (error) => {
      expect(authErrorCode(error)).toBe("unknown");
    },
  );
});

describe("isUserNotFound", () => {
  it("is true only for that code", () => {
    expect(isUserNotFound({ code: "auth/user-not-found" })).toBe(true);
    expect(isUserNotFound({ code: "auth/wrong-password" })).toBe(false);
    expect(isUserNotFound(null)).toBe(false);
  });
});

describe("isPermissionDenied", () => {
  it("is true only for that code", () => {
    expect(isPermissionDenied({ code: "permission-denied" })).toBe(true);
    expect(isPermissionDenied({ code: "unavailable" })).toBe(false);
    expect(isPermissionDenied(domainError("not_owner"))).toBe(false);
    expect(isPermissionDenied("permission-denied")).toBe(false);
    expect(isPermissionDenied(undefined)).toBe(false);
  });
});

describe("firestoreError", () => {
  it.each([
    ["permission-denied", "taken", "taken"],
    ["permission-denied", "not_owner", "not_owner"],
    ["unavailable", "taken", "offline"],
    ["deadline-exceeded", "taken", "offline"],
    ["resource-exhausted", "taken", "unknown"],
    ["internal", "not_owner", "unknown"],
  ] as const)("%s (refusal means %s) -> %s", (code, permissionDenied, expected) => {
    const error = firestoreError({ code }, permissionDenied);
    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe(expected);
  });

  it("passes our own errors through", () => {
    const offline = domainError("offline");
    expect(firestoreError(offline, "taken")).toBe(offline);
  });

  it.each(DOMAIN_ERROR_CODES)("never leaks details into %s", (code) => {
    const sdkError = Object.assign(new Error("Missing permission for levi@example.com"), { code: "permission-denied" });
    const error = firestoreError(sdkError, code);
    expect(error.message).toBe(code);
    expect(JSON.stringify(error) + String(error)).not.toContain("levi@example.com");
  });
});
