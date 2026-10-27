import { DOMAIN_ERROR_CODES, domainError, isDomainError, withDomainErrors } from "../domainErrors";

describe("domainError", () => {
  it.each(DOMAIN_ERROR_CODES)("creates a recognisable %s error", (code) => {
    const error = domainError(code);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DomainError");
    expect(error.code).toBe(code);
    expect(error.message).toBe(code);
    expect(isDomainError(error)).toBe(true);
  });
});

describe("isDomainError", () => {
  it.each([
    new Error("offline"),
    Object.assign(new Error("x"), { name: "DomainError", code: "auth/network-request-failed" }),
    { name: "DomainError", code: "offline" }, // not an Error
    "offline",
    null,
    undefined,
  ])("rejects %p", (value) => {
    expect(isDomainError(value)).toBe(false);
  });
});

describe("withDomainErrors", () => {
  it("returns the result when nothing fails", async () => {
    expect(await withDomainErrors(async () => 42)).toBe(42);
  });

  it("passes domain errors through unchanged", async () => {
    const original = domainError("offline");
    await expect(withDomainErrors(async () => Promise.reject(original))).rejects.toBe(original);
  });

  it("replaces any other error and drops its details", async () => {
    const sdkError = Object.assign(new Error("Firebase: user levi@example.com not found"), {
      code: "auth/user-not-found",
    });
    const caught = await withDomainErrors(async () => {
      throw sdkError;
    }).catch((error: unknown) => error);

    expect(isDomainError(caught)).toBe(true);
    expect(caught).toMatchObject({ code: "unknown" });
    expect(JSON.stringify(caught) + String(caught)).not.toContain("levi@example.com");
  });

  it("uses the fallback code", async () => {
    await expect(
      withDomainErrors(async () => {
        throw new TypeError("native failure");
      }, "storage_failed"),
    ).rejects.toMatchObject({ code: "storage_failed" });
  });
});
