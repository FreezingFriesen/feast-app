import { issuesToFieldErrors } from "@/components/form/fieldErrors";
import { DOMAIN_ERROR_CODES } from "@/services/domainErrors";
import { changePasswordFormSchema, signInSchema, signUpFormSchema } from "@/validation/authSchema";
import {
  accountErrorMessage,
  accountFieldMessage,
  sessionEndedMessage,
  type AccountAction,
} from "../accountMessages";

const ACTIONS: AccountAction[] = [
  "log_in",
  "sign_up",
  "reset_password",
  "choose_username",
  "change_password",
  "verify_email",
  "delete_account",
];

const fieldErrors = (schema: { safeParse(input: unknown): { success: boolean; error?: unknown } }, input: unknown) => {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("Expected the input to be invalid");
  return issuesToFieldErrors(result.error as never, accountFieldMessage);
};

describe("accountErrorMessage", () => {
  it.each(DOMAIN_ERROR_CODES)("has a message for %s in every action", (code) => {
    for (const action of ACTIONS) {
      expect(accountErrorMessage(code, action).length).toBeGreaterThan(0);
    }
  });

  it("names the action when offline", () => {
    expect(accountErrorMessage("offline", "log_in")).toBe("You're offline. Connect to the internet to log in.");
    expect(accountErrorMessage("offline", "reset_password")).toContain("reset your password");
  });

  it("doesn't say whether the account exists", () => {
    const message = accountErrorMessage("invalid_credentials", "log_in").toLowerCase();
    expect(message).not.toMatch(/no account|not found|doesn't exist|wrong password|registered/);
  });
});

describe("accountFieldMessage", () => {
  it("explains each sign up field", () => {
    expect(
      fieldErrors(signUpFormSchema, { email: "nope", username: "a b", password: "short", confirmPassword: "short" }),
    ).toEqual({
      email: "Enter a valid email address.",
      username: "Use 3–20 characters: letters, numbers and underscores.",
      password: "Use at least 8 characters.",
    });
    expect(fieldErrors(signUpFormSchema, { email: "", username: "levi", password: "long enough", confirmPassword: "x" })).toEqual({
      email: "Enter your email address.",
      confirmPassword: "Passwords don't match.",
    });
  });

  it("only asks for a password on log in", () => {
    expect(fieldErrors(signInSchema, { email: "levi@example.com", password: "" })).toEqual({
      password: "Enter your password.",
    });
  });

  it("asks for the current password when changing it", () => {
    expect(
      fieldErrors(changePasswordFormSchema, { currentPassword: "", newPassword: "new password", confirmPassword: "new password" }),
    ).toEqual({ currentPassword: "Enter your current password." });
  });

  it("explains reusing the current password", () => {
    expect(
      fieldErrors(changePasswordFormSchema, { currentPassword: "same password", newPassword: "same password", confirmPassword: "same password" }),
    ).toEqual({ newPassword: "Choose a different password" });
  });

  it("never repeats what was typed", () => {
    const attack = "<script>alert(1)</script>";
    const errors = fieldErrors(signUpFormSchema, {
      email: attack,
      username: attack,
      password: "'; DROP",
      confirmPassword: attack,
    });
    expect(JSON.stringify(errors)).not.toContain(attack);
    expect(JSON.stringify(errors)).not.toContain("DROP");
  });
});

describe("sessionEndedMessage", () => {
  it("explains why the session ended", () => {
    expect(sessionEndedMessage({ state: "ended", reason: "expired" })).toContain("30 days");
    expect(sessionEndedMessage({ state: "ended", reason: "clock_before_login" })).toContain("For your security");
    expect(sessionEndedMessage({ state: "ended", reason: "missing" })).toContain("For your security");
  });

  it("says nothing otherwise", () => {
    expect(sessionEndedMessage(null)).toBeNull();
    expect(sessionEndedMessage({ state: "signed_out" })).toBeNull();
    expect(sessionEndedMessage({ state: "active", expiresAt: 0 })).toBeNull();
  });
});
