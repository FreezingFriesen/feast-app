import { logOutPrompt } from "../logOutPrompt";

const base = { pendingChanges: 0, online: true, syncAvailable: true, wipesLocalData: true };
const choices = (prompt: ReturnType<typeof logOutPrompt>) => prompt.actions.map((action) => action.choice);

describe("log out confirmation", () => {
  it("asks plainly when everything is synced", () => {
    const prompt = logOutPrompt(base);
    expect(prompt.title).toBe("Log out?");
    expect(prompt.message).toBe("Recipes and meal plans will be removed from this phone.");
    expect(choices(prompt)).toEqual([null, "log_out"]);
  });

  it("says nothing about removing data when the wipe is off", () => {
    expect(logOutPrompt({ ...base, wipesLocalData: false }).message).toBe("You can log back in at any time.");
  });

  it("warns that data isn't backed up while sync doesn't exist", () => {
    expect(logOutPrompt({ ...base, syncAvailable: false }).message).toContain("aren't backed up yet");
  });

  it("warns about unsynced changes and offers to sync first", () => {
    const prompt = logOutPrompt({ ...base, pendingChanges: 3 });
    expect(prompt.title).toBe("You have unsynced changes");
    expect(prompt.message).toContain("3 changes haven't synced yet");
    expect(choices(prompt)).toEqual([null, "log_out", "sync_then_log_out"]);
  });

  it("uses the singular for one change", () => {
    expect(logOutPrompt({ ...base, pendingChanges: 1 }).message).toContain("1 change hasn't synced yet. If you log out now, it will be lost.");
  });

  it("doesn't offer to sync while offline", () => {
    const prompt = logOutPrompt({ ...base, pendingChanges: 2, online: false });
    expect(prompt.message).toContain("You're offline");
    expect(choices(prompt)).toEqual([null, "log_out"]);
  });

  it("doesn't offer to sync when sync isn't available", () => {
    const prompt = logOutPrompt({ ...base, pendingChanges: 2, syncAvailable: false });
    expect(prompt.message).toContain("Sync isn't available");
    expect(choices(prompt)).toEqual([null, "log_out"]);
  });

  it("always offers cancel first", () => {
    for (const pendingChanges of [0, 1, 5]) {
      expect(logOutPrompt({ ...base, pendingChanges }).actions[0]).toEqual({ label: "Cancel", choice: null, style: "cancel" });
    }
  });
});
