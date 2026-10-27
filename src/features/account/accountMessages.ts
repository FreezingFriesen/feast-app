import { friendlyMessage } from "@/components/form/fieldErrors";
import type { DomainErrorCode } from "@/services/domainErrors";
import type { SessionCheck } from "@/services/session/sessionGuard";
import {
  MAX_PASSWORD_LENGTH,
  MAX_USERNAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  MIN_USERNAME_LENGTH,
} from "@/validation/authSchema";
import type { z } from "zod";
import type { UsernameCheck } from "./useUsernameAvailability";

// What the user was trying to do, for messages like "connect to the internet to …".
export type AccountAction =
  | "log_in"
  | "sign_up"
  | "reset_password"
  | "choose_username"
  | "change_password"
  | "verify_email"
  | "delete_account";

const ACTION_TEXT: Record<AccountAction, string> = {
  log_in: "log in",
  sign_up: "create an account",
  reset_password: "reset your password",
  choose_username: "save your username",
  change_password: "change your password",
  verify_email: "send a verification email",
  delete_account: "delete your account",
};

export const USERNAME_HINT = `${MIN_USERNAME_LENGTH}–${MAX_USERNAME_LENGTH} characters: letters, numbers and underscores.`;

// N-16: shown whether or not an account exists for the email.
export const PASSWORD_RESET_SENT =
  "If an account exists for that email, we've sent it a link to reset your password. Check your inbox.";

export function offlineMessage(action: AccountAction): string {
  return `You're offline. Connect to the internet to ${ACTION_TEXT[action]}.`;
}

// Messages never repeat what the user typed and never say whether an account exists.
export function accountErrorMessage(code: DomainErrorCode, action: AccountAction): string {
  switch (code) {
    case "invalid_credentials":
      return "That email and password don't match. Check them and try again.";
    case "sign_up_failed":
      return "We couldn't create an account with those details. If you already have an account, log in or reset your password.";
    case "taken":
      return "That username is taken. Try another one.";
    case "rate_limited":
      return "Too many attempts. Wait a few minutes, then try again.";
    case "offline":
      return offlineMessage(action);
    case "requires_recent_login":
      return "Please log in again to continue.";
    case "invalid_input":
      return "Please fix the highlighted fields.";
    case "backend_not_configured":
      return "This build isn't connected to a backend yet.";
    case "sync_failed":
      return "Your changes couldn't be synced, so you're still logged in. Try again when you're online.";
    default:
      return "Something went wrong. Please try again.";
  }
}

// Field wording for the account forms. Falls back to the shared wording.
export function accountFieldMessage(issue: z.core.$ZodIssue): string {
  const field = String(issue.path[0] ?? "");
  switch (field) {
    case "email":
      return issue.code === "too_small" ? "Enter your email address." : "Enter a valid email address.";
    case "username":
      return `Use ${USERNAME_HINT.charAt(0).toLowerCase()}${USERNAME_HINT.slice(1)}`;
    case "password":
    case "newPassword":
    case "currentPassword":
      if (issue.code === "too_small") {
        // Log in only needs something typed; new passwords have a minimum length.
        if (issue.minimum !== 1) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
        return field === "currentPassword" ? "Enter your current password." : "Enter your password.";
      }
      if (issue.code === "too_big") return `Use ${MAX_PASSWORD_LENGTH} characters or fewer.`;
      return issue.code === "custom" ? issue.message : friendlyMessage(issue);
    case "confirmPassword":
      return issue.code === "too_big" ? `Use ${MAX_PASSWORD_LENGTH} characters or fewer.` : "Passwords don't match.";
    default:
      return friendlyMessage(issue);
  }
}

export type UsernameCheckTone = "muted" | "success" | "error";

// The line under the username field while typing. Rule hints aren't shown as errors.
export function usernameCheckMessage(check: UsernameCheck): { text: string; tone: UsernameCheckTone } {
  switch (check) {
    case "checking":
      return { text: "Checking availability…", tone: "muted" };
    case "available":
      return { text: "✓ Available", tone: "success" };
    case "taken":
      return { text: "That username is taken. Try another one.", tone: "error" };
    case "offline":
      return { text: "You're offline, so availability can't be checked.", tone: "muted" };
    case "error":
      return { text: "Couldn't check availability right now.", tone: "muted" };
    default:
      return { text: USERNAME_HINT, tone: "muted" };
  }
}

// Why the user is looking at the log in screen again (N-15).
export function sessionEndedMessage(check: SessionCheck | null): string | null {
  if (check?.state !== "ended") return null;
  return check.reason === "expired"
    ? "It's been 30 days since you logged in, so you were signed out. Please log in again."
    : "For your security, you were signed out. Please log in again.";
}

// "October 24, 2026" in the device's language.
export function formatLongDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
