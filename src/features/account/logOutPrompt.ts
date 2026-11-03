// What the user picked in the pop-up (other than Cancel).
export type LogOutChoice = "log_out" | "sync_then_log_out";

// The pop-up's title, message and buttons. "style" sets how the phone draws each
// button (destructive is red on iOS).
export type LogOutPrompt = {
  title: string;
  message: string;
  // choice null = cancel
  actions: { label: string; choice: LogOutChoice | null; style: "default" | "cancel" | "destructive" }[];
};

// The context for the log out prompt. It includes the number of pending changes, whether the user is online, 
// whether syncing is available, and whether logging out will wipe local data.
type LogOutContext = {
  pendingChanges: number;
  online: boolean | null;
  syncAvailable: boolean;
  wipesLocalData: boolean;
};

// The Cancel button. It comes first in every version of the prompt.
const CANCEL = { label: "Cancel", choice: null, style: "cancel" } as const;

// The confirmation shown before logging out. Warns about changes that haven't synced
// and offers to sync first when that's possible.
export function logOutPrompt({ pendingChanges, online, syncAvailable, wipesLocalData }: LogOutContext): LogOutPrompt {
  // An extra warning when logging out also clears this phone. Stronger when there's
  // no sync yet, because then the data isn't backed up anywhere.
  const wipeNote = !wipesLocalData
    ? ""
    : syncAvailable
      ? "Recipes and meal plans will be removed from this phone."
      : "Recipes and meal plans on this phone will be deleted. They aren't backed up yet, so they can't be restored.";

  // Nothing waiting to sync: a plain "Log out?" with Cancel and Log out.
  if (pendingChanges <= 0) {
    return {
      title: "Log out?",
      message: wipeNote || "You can log back in at any time.",
      actions: [CANCEL, { label: "Log out", choice: "log_out", style: "destructive" }],
    };
  }

  // Warn about unsynced changes. If syncing is available, offer to sync first. Otherwise, just warn that the changes will be lost.
  const canSync = syncAvailable && online !== false;
  const changes = pendingChanges === 1 ? "1 change hasn't" : `${pendingChanges} changes haven't`;
  const why = canSync ? "" : syncAvailable ? " You're offline, so they can't sync right now." : " Sync isn't available right now.";
  return {
    title: "You have unsynced changes",
    message: [`${changes} synced yet. If you log out now, ${pendingChanges === 1 ? "it" : "they"} will be lost.${why}`, wipeNote]
      .filter(Boolean)
      .join(" "),
    actions: canSync
      ? [
          CANCEL,
          { label: "Log out anyway", choice: "log_out", style: "destructive" },
          { label: "Sync, then log out", choice: "sync_then_log_out", style: "default" },
        ]
      : [CANCEL, { label: "Log out anyway", choice: "log_out", style: "destructive" }],
  };
}
