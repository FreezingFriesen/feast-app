// N-15: a session lasts 30 days from the login date stored on the device.
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionStatus =
  | { state: "active"; loginAt: number; expiresAt: number }
  | { state: "expired"; loginAt: number; expiresAt: number }
  // missing: no valid login date is stored.
  // clock_before_login: the device clock is earlier than the login date (or unusable),
  // so the elapsed time can't be trusted.
  | { state: "invalid"; reason: "missing" | "clock_before_login" };

// Pure rules with no storage. Anything other than "active" means sign out.
export type SessionPolicy = {
  evaluate(loginAt: number | null): SessionStatus;
};

// The clock is passed in so tests can control it.
export function createSessionPolicy(
  now: () => number = Date.now,
  maxAgeMs: number = SESSION_MAX_AGE_MS,
): SessionPolicy {
  return {
    evaluate(loginAt) {
      if (loginAt === null || !Number.isFinite(loginAt)) {
        return { state: "invalid", reason: "missing" };
      }
      const current = now();
      if (!Number.isFinite(current) || current < loginAt) {
        return { state: "invalid", reason: "clock_before_login" };
      }
      const expiresAt = loginAt + maxAgeMs;
      return current >= expiresAt
        ? { state: "expired", loginAt, expiresAt }
        : { state: "active", loginAt, expiresAt };
    },
  };
}
