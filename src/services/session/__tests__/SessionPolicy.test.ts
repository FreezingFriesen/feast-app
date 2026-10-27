import { createSessionPolicy, SESSION_MAX_AGE_MS } from "../SessionPolicy";

const DAY = 24 * 60 * 60 * 1000;
const LOGIN = Date.UTC(2026, 9, 1, 12, 0);

const evaluateAt = (time: number, loginAt: number | null = LOGIN) =>
  createSessionPolicy(() => time).evaluate(loginAt);

describe("SessionPolicy", () => {
  it("lasts 30 days", () => {
    expect(SESSION_MAX_AGE_MS).toBe(30 * DAY);
  });

  it("is active right after login and on day 29", () => {
    expect(evaluateAt(LOGIN)).toEqual({ state: "active", loginAt: LOGIN, expiresAt: LOGIN + 30 * DAY });
    expect(evaluateAt(LOGIN + 29 * DAY).state).toBe("active");
  });

  it("is still active 1 ms before 30 days", () => {
    expect(evaluateAt(LOGIN + 30 * DAY - 1).state).toBe("active");
  });

  it("expires at exactly 30 days", () => {
    expect(evaluateAt(LOGIN + 30 * DAY)).toEqual({
      state: "expired",
      loginAt: LOGIN,
      expiresAt: LOGIN + 30 * DAY,
    });
  });

  it("is expired on day 31", () => {
    expect(evaluateAt(LOGIN + 31 * DAY).state).toBe("expired");
  });

  it("is invalid when the clock is set back before the login date", () => {
    expect(evaluateAt(LOGIN - 1)).toEqual({ state: "invalid", reason: "clock_before_login" });
    expect(evaluateAt(LOGIN - 365 * DAY)).toEqual({ state: "invalid", reason: "clock_before_login" });
  });

  it("is invalid when the clock is unusable", () => {
    expect(evaluateAt(NaN)).toEqual({ state: "invalid", reason: "clock_before_login" });
  });

  it("is invalid without a usable login date", () => {
    expect(evaluateAt(LOGIN, null)).toEqual({ state: "invalid", reason: "missing" });
    expect(evaluateAt(LOGIN, NaN)).toEqual({ state: "invalid", reason: "missing" });
    expect(evaluateAt(LOGIN, Infinity)).toEqual({ state: "invalid", reason: "missing" });
  });
});
