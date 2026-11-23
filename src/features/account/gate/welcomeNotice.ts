// The note at the top of the welcome screen: why the user was signed out, or what
// happened while they logged out or deleted their account. Plain module, tested on its own.
import { sessionEndedMessage } from "../accountMessages";
import type { EndedSession } from "./sessionGateState";

// Set by the log out button and the delete account screen. Both sign out before they
// clear the phone, and the gate shows the welcome screen as soon as nobody is signed
// in, so the result of the last step is shown there.
export type AccountNotice = "account_deleted" | "delete_wipe_failed" | "log_out_wipe_failed";

export type WelcomeNotice = {
  kind: "session_ended" | AccountNotice;
  tone: "info" | "success" | "error";
  message: string;
  // True when clearing the phone failed: the welcome screen offers "Try again".
  retryWipe: boolean;
};

export const ACCOUNT_DELETED_MESSAGE = "Your account has been deleted.";
export const DELETE_WIPE_FAILED_MESSAGE =
  "Your account has been deleted, but Feast couldn't clear this phone. Try again to remove what's left.";
export const LOG_OUT_WIPE_FAILED_MESSAGE =
  "You're logged out, but some data couldn't be removed from this phone. Try again to remove it.";

// The account notice wins: it's always the more recent event.
export function welcomeNotice(account: AccountNotice | null, ended: EndedSession | null): WelcomeNotice | null {
  switch (account) {
    case "account_deleted":
      return { kind: account, tone: "success", message: ACCOUNT_DELETED_MESSAGE, retryWipe: false };
    case "delete_wipe_failed":
      return { kind: account, tone: "error", message: DELETE_WIPE_FAILED_MESSAGE, retryWipe: true };
    case "log_out_wipe_failed":
      return { kind: account, tone: "error", message: LOG_OUT_WIPE_FAILED_MESSAGE, retryWipe: true };
    case null: {
      const message = sessionEndedMessage(ended);
      return message ? { kind: "session_ended", tone: "info", message, retryWipe: false } : null;
    }
  }
}
