export type LogOutChoice = "log_out" | "sync_then_log_out";

export type LogOutPrompt = {
  title: string;
  message: string;
  // choice null = cancel
  actions: { label: string; choice: LogOutChoice | null; style: "default" | "cancel" | "destructive" }[];
};

type LogOutContext = {
  pendingChanges: number;
  online: boolean | null;
  syncAvailable: boolean;
  wipesLocalData: boolean;
};

const CANCEL = { label: "Cancel", choice: null, style: "cancel" } as const;

// The confirmation shown before logging out. Warns about changes that haven't synced
// and offers to sync first when that's possible.
export function logOutPrompt({ pendingChanges, online, syncAvailable, wipesLocalData }: LogOutContext): LogOutPrompt {
  const wipeNote = !wipesLocalData
    ? ""
    : syncAvailable
      ? "Recipes and meal plans will be removed from this phone."
      : "Recipes and meal plans on this phone will be deleted. They aren't backed up yet, so they can't be restored.";

  if (pendingChanges <= 0) {
    return {
      title: "Log out?",
      message: wipeNote || "You can log back in at any time.",
      actions: [CANCEL, { label: "Log out", choice: "log_out", style: "destructive" }],
    };
  }

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
