// Open team decisions (docs/PROJECT_PLAN.md, Open items). These are the defaults
// until the team confirms them. Change them here and nowhere else.
export const ACCOUNT_DECISIONS = {
  // Explicit log out wipes local data after the user confirms (shared devices).
  wipeLocalDataOnLogout: true,
  // An expired session signs out but keeps local data, and asks the user to log in again.
  wipeLocalDataOnSessionExpiry: false,
  // Email verification is shown and can be resent, but doesn't block using the app.
  requireEmailVerification: false,
  // Changing username is only built in the optional last phase.
  allowUsernameChange: false,
} satisfies Record<string, boolean>;
