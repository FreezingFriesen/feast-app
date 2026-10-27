import type { AccountDeletionResult } from "@/services/account/AccountDeleter";
import { deleteAccountSchema } from "@/validation/authSchema";
import { accountErrorMessage } from "./accountMessages";

type DeletionFailure = Extract<AccountDeletionResult, { ok: false }>;

// What deleting the account removes (N-17), shown before the user confirms.
export function deletionItems(username: string, email: string | null): string[] {
  return [
    `Your account and sign-in${email ? ` (${email})` : ""}`,
    `Your username, ${username}. Someone else will be able to use it.`,
    "Your profile and dietary restrictions",
    "Recipes and meal plans saved to your account",
    "Everything Feast has saved on this phone",
  ];
}

// The typed confirmation is the username, cleaned and lowercased like any username.
export function confirmsUsername(typed: string, username: string): boolean {
  const parsed = deleteAccountSchema.shape.confirmation.safeParse(typed);
  return parsed.success && parsed.data === username;
}

export type DeletionFailureView = {
  message: string;
  // Which input to mark, if the problem is one of them.
  field: "password" | "confirmation" | null;
  // delete: run the whole deletion again (every step is safe to repeat).
  // wipe_local: the account is gone; only clearing this phone is left.
  retry: "delete" | "wipe_local" | null;
};

// How a failed deletion is explained. After the first server step, part of the
// account may already be gone, so the message says the deletion didn't finish.
export function deletionFailureView(result: DeletionFailure): DeletionFailureView {
  const { failedStep, error } = result;

  if (failedStep === "confirm") {
    return error === "invalid_input"
      ? { message: "That doesn't match your username.", field: "confirmation", retry: null }
      : { message: accountErrorMessage(error, "log_in"), field: null, retry: null };
  }
  if (failedStep === "reauthenticate") {
    return error === "invalid_credentials"
      ? { message: "That password isn't right.", field: "password", retry: null }
      : { message: `${accountErrorMessage(error, "log_in")} Nothing was deleted.`, field: null, retry: "delete" };
  }
  if (failedStep === "wipe_local") {
    return {
      message: "Your account was deleted, but some data couldn't be removed from this phone.",
      field: null,
      retry: "wipe_local",
    };
  }
  const why = error === "offline" ? "You're offline." : "Something went wrong.";
  return {
    message: `${why} Your account was only partly deleted. Try again to finish deleting it.`,
    field: null,
    retry: "delete",
  };
}
