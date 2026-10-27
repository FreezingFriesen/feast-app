// The only errors our service and storage implementations report. Screens depend on
// these codes, never on a Firebase or native error code or type.
export const DOMAIN_ERROR_CODES = [
  "invalid_input",
  "invalid_credentials",
  "sign_up_failed",
  "requires_recent_login",
  "rate_limited",
  "offline",
  "taken",
  "not_owner",
  "not_found",
  "storage_failed",
  "sync_failed",
  "backend_not_configured",
  "unknown",
] as const;
export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

// Expected failures (wrong password, offline, name taken) are returned as results
// with one of these codes. Anything an implementation throws is a DomainError.
export type DomainError = Error & { readonly name: "DomainError"; readonly code: DomainErrorCode };

// A plain Error with a code, not a subclass (composition over inheritance).
// The message is only the code, so it never carries personal data.
export function domainError(code: DomainErrorCode): DomainError {
  return Object.assign(new Error(code), { name: "DomainError" as const, code });
}

export function isDomainError(value: unknown): value is DomainError {
  return (
    value instanceof Error &&
    value.name === "DomainError" &&
    (DOMAIN_ERROR_CODES as readonly unknown[]).includes((value as { code?: unknown }).code)
  );
}

// The code to put in a result, limited to the codes that result allows.
export function errorCodeIn<T extends DomainErrorCode>(error: unknown, allowed: readonly T[]): T | "unknown" {
  return isDomainError(error) && (allowed as readonly DomainErrorCode[]).includes(error.code)
    ? (error.code as T)
    : "unknown";
}

// Wrap implementation methods with this. DomainErrors pass through; anything else
// (SDK, native or programming errors) becomes `fallback`. The original error is
// dropped because it may contain SDK details or personal data.
export async function withDomainErrors<T>(
  operation: () => Promise<T>,
  fallback: DomainErrorCode = "unknown",
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw isDomainError(error) ? error : domainError(fallback);
  }
}
