import {
  changePasswordFormSchema,
  chunkManifestSchema,
  currentPasswordSchema,
  emailSchema,
  MAX_SESSION_ITEMS,
  newAccountSchema,
  passwordSchema,
  sessionItemIndexSchema,
  signInSchema,
  signUpFormSchema,
  storedLoginAtSchema,
  storedUsernameSchema,
  timestampSchema,
  uidSchema,
  usernameSchema,
} from "../authSchema";

const ATTACK_STRINGS = [
  "'; DROP TABLE recipes;--",
  "<script>alert(1)</script>",
  "a".repeat(10_000),
  "",
  "🍕",
  "../x",
  "a/b",
];

const ZWSP = "​"; // zero-width space
const RLO = "‮"; // right-to-left override

const accepts = (schema: { safeParse(input: unknown): { success: boolean } }, input: unknown) =>
  schema.safeParse(input).success;

describe("usernameSchema", () => {
  it.each([
    ["ab", false], // 2
    ["abc", true], // 3
    ["a".repeat(20), true], // 20
    ["a".repeat(21), false], // 21
  ])("length boundary %p -> %p", (username, ok) => {
    expect(accepts(usernameSchema, username)).toBe(ok);
  });

  it("lowercases capitals", () => {
    expect(usernameSchema.parse("Levi_F99")).toBe("levi_f99");
  });

  it("trims surrounding whitespace but rejects spaces inside", () => {
    expect(usernameSchema.parse("  levi  ")).toBe("levi");
    expect(accepts(usernameSchema, "levi f")).toBe(false);
    expect(accepts(usernameSchema, "Levi F")).toBe(false);
  });

  it("strips invisible and direction-override characters before checking", () => {
    expect(usernameSchema.parse(`le${ZWSP}vi`)).toBe("levi");
    expect(usernameSchema.parse(`${RLO}levi`)).toBe("levi");
    // Stripping must not let a too-short name through
    expect(accepts(usernameSchema, `ab${ZWSP}`)).toBe(false);
  });

  it.each(["levi🍕", "lévi", "ｌｅｖｉ", "levi-f", "levi.f", "levi@x"])("rejects %p", (username) => {
    expect(accepts(usernameSchema, username)).toBe(false);
  });

  it.each(ATTACK_STRINGS)("rejects attack input %#", (attack) => {
    expect(accepts(usernameSchema, attack)).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(accepts(usernameSchema, 123)).toBe(false);
    expect(accepts(usernameSchema, null)).toBe(false);
    expect(accepts(usernameSchema, ["levi"])).toBe(false);
  });
});

describe("storedUsernameSchema", () => {
  it("accepts only canonical usernames, without cleaning", () => {
    expect(accepts(storedUsernameSchema, "levi_f")).toBe(true);
    expect(accepts(storedUsernameSchema, "Levi")).toBe(false);
    expect(accepts(storedUsernameSchema, " levi")).toBe(false);
  });
});

describe("passwordSchema", () => {
  it.each([
    ["a".repeat(7), false],
    ["a".repeat(8), true],
    ["a".repeat(128), true],
    ["a".repeat(129), false],
  ])("length boundary %#", (password, ok) => {
    expect(accepts(passwordSchema, password)).toBe(ok);
  });

  it("counts an emoji as one character", () => {
    expect(accepts(passwordSchema, "🍕".repeat(7))).toBe(false);
    expect(accepts(passwordSchema, "🍕".repeat(8))).toBe(true);
    expect(accepts(passwordSchema, "🍕".repeat(128))).toBe(true);
    expect(accepts(passwordSchema, "🍕".repeat(129))).toBe(false);
  });

  it.each([
    "  spaces  ",
    "pässwörd!",
    "🍕🍕🍕🍕🍕🍕🍕🍕",
    "'; DROP TABLE recipes;--",
    "<script>alert(1)</script>",
    `pass${ZWSP}word`,
  ])("returns the password exactly as typed %#", (password) => {
    expect(passwordSchema.parse(password)).toBe(password);
  });

  it("never includes the password in validation errors", () => {
    const secret = "short1!";
    const result = passwordSchema.safeParse(secret);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).not.toContain(secret);
    expect(result.error?.message).not.toContain(secret);
  });

  it("rejects empty, very long and non-string input", () => {
    expect(accepts(passwordSchema, "")).toBe(false);
    expect(accepts(passwordSchema, "a".repeat(10_000))).toBe(false);
    expect(accepts(passwordSchema, 12345678)).toBe(false);
  });
});

describe("currentPasswordSchema", () => {
  it("only bounds the length, so old passwords and typos reach the server", () => {
    expect(accepts(currentPasswordSchema, "x")).toBe(true);
    expect(accepts(currentPasswordSchema, "")).toBe(false);
    expect(accepts(currentPasswordSchema, "a".repeat(129))).toBe(false);
  });
});

describe("emailSchema", () => {
  const local64 = "a".repeat(64);
  // 64 + "@" + domain = total characters. Domain labels are at most 63 characters.
  const domainFor = (total: number) =>
    `${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(total - 64 - 1 - 132)}.com`;

  it("cleans and lowercases", () => {
    expect(emailSchema.parse("  Levi.F@Example.COM ")).toBe("levi.f@example.com");
    expect(emailSchema.parse(`levi${ZWSP}@example.com`)).toBe("levi@example.com");
  });

  it.each([
    [`${local64}@${domainFor(254)}`, true],
    [`${local64}@${domainFor(255)}`, false],
    [`${"a".repeat(65)}@example.com`, false],
    [`${local64}@example.com`, true],
  ])("length boundary %#", (email, ok) => {
    expect(accepts(emailSchema, email)).toBe(ok);
  });

  it.each([
    "levi",
    "levi@",
    "@example.com",
    "levi@example",
    "levi@@example.com",
    "levi @example.com",
    "levi@exa mple.com",
    "lévi@example.com",
    "levi@-example.com",
    `levi@${"b".repeat(64)}.com`, // domain label over 63
  ])("rejects %p", (email) => {
    expect(accepts(emailSchema, email)).toBe(false);
  });

  it.each(ATTACK_STRINGS)("rejects attack input %#", (attack) => {
    expect(accepts(emailSchema, attack)).toBe(false);
  });
});

describe("uidSchema", () => {
  it("accepts a real Firebase uid with capitals", () => {
    expect(accepts(uidSchema, "Xy3kP9qLmN2vB7cD1eF4gH6jK8l0")).toBe(true);
  });

  it.each([...ATTACK_STRINGS, "a".repeat(129), "abc def", "abc_def"])(
    "rejects %#",
    (uid) => {
      expect(accepts(uidSchema, uid)).toBe(false);
    },
  );
});

describe("signUpFormSchema", () => {
  const valid = {
    email: "Levi@Example.com",
    username: "Levi_F",
    password: "correct horse",
    confirmPassword: "correct horse",
  };

  it("returns cleaned values without confirmPassword", () => {
    expect(signUpFormSchema.parse(valid)).toEqual({
      email: "levi@example.com",
      username: "levi_f",
      password: "correct horse",
    });
  });

  it("reports a mismatched confirmation on confirmPassword", () => {
    const result = signUpFormSchema.safeParse({ ...valid, confirmPassword: "correct horse " });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual(["confirmPassword"]);
  });

  it("drops unknown fields", () => {
    expect(signUpFormSchema.parse({ ...valid, uid: "someone-else", isAdmin: true })).not.toHaveProperty(
      "uid",
    );
  });

  it("rejects attack input in every field", () => {
    for (const attack of ATTACK_STRINGS) {
      expect(accepts(signUpFormSchema, { ...valid, email: attack })).toBe(false);
      expect(accepts(signUpFormSchema, { ...valid, username: attack })).toBe(false);
    }
  });
});

describe("changePasswordFormSchema", () => {
  const valid = { currentPassword: "old password", newPassword: "new password", confirmPassword: "new password" };

  it("returns only the current and new password", () => {
    expect(changePasswordFormSchema.parse(valid)).toEqual({
      currentPassword: "old password",
      newPassword: "new password",
    });
  });

  it("rejects a mismatch and reusing the current password", () => {
    const mismatch = changePasswordFormSchema.safeParse({ ...valid, confirmPassword: "other" });
    expect(mismatch.error?.issues[0].path).toEqual(["confirmPassword"]);

    const same = changePasswordFormSchema.safeParse({
      currentPassword: "same password",
      newPassword: "same password",
      confirmPassword: "same password",
    });
    expect(same.error?.issues[0].path).toEqual(["newPassword"]);
  });

  it("applies the password rules to the new password", () => {
    expect(accepts(changePasswordFormSchema, { ...valid, newPassword: "short", confirmPassword: "short" })).toBe(
      false,
    );
  });
});

describe("AuthService input schemas", () => {
  it("newAccountSchema enforces the password rules, signInSchema does not", () => {
    expect(accepts(newAccountSchema, { email: "a@b.co", password: "short" })).toBe(false);
    expect(accepts(signInSchema, { email: "a@b.co", password: "short" })).toBe(true);
  });
});

describe("timestampSchema", () => {
  it.each([
    [Date.UTC(2026, 9, 23), true],
    [Date.UTC(2020, 0, 1), true],
    [Date.UTC(2019, 11, 31), false],
    [Date.UTC(2101, 0, 1), false],
    [1.5, false],
    [-1, false],
    [NaN, false],
    [Infinity, false],
    ["1761177600000", false],
  ])("%p -> %p", (value, ok) => {
    expect(accepts(timestampSchema, value)).toBe(ok);
  });
});

describe("stored session schemas", () => {
  it("reads a stored login date", () => {
    expect(storedLoginAtSchema.parse("1761177600000")).toBe(1761177600000);
  });

  it.each(["", "abc", "-1", "1.5", "1e12", " 1761177600000", "0", "9".repeat(30), "NaN"])(
    "rejects stored login date %p",
    (raw) => {
      expect(accepts(storedLoginAtSchema, raw)).toBe(false);
    },
  );

  it("validates chunk manifests", () => {
    expect(accepts(chunkManifestSchema, { slot: "a", count: 3, length: 1500 })).toBe(true);
    expect(accepts(chunkManifestSchema, { slot: "c", count: 3, length: 1500 })).toBe(false);
    expect(accepts(chunkManifestSchema, { slot: "a", count: 17, length: 1500 })).toBe(false);
    expect(accepts(chunkManifestSchema, { slot: "a", count: -1, length: 0 })).toBe(false);
    expect(accepts(chunkManifestSchema, { slot: "a", count: 1 })).toBe(false);
  });

  it("validates the item index", () => {
    expect(accepts(sessionItemIndexSchema, ["firebase_003aauthUser"])).toBe(true);
    expect(accepts(sessionItemIndexSchema, ["has space"])).toBe(false);
    expect(accepts(sessionItemIndexSchema, ["a:b"])).toBe(false);
    expect(accepts(sessionItemIndexSchema, Array(MAX_SESSION_ITEMS + 1).fill("a"))).toBe(false);
  });
});
