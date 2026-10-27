import type { AccountDeletionStep } from "@/services/account/AccountDeleter";
import { confirmsUsername, deletionFailureView, deletionItems } from "../deleteAccountMessages";

describe("delete account wording (N-17)", () => {
  it("lists what will be deleted, including the username being freed", () => {
    const items = deletionItems("levi_f", "levi@example.com");
    expect(items[0]).toContain("levi@example.com");
    expect(items[1]).toContain("levi_f");
    expect(items.join(" ")).toContain("on this phone");
  });

  it.each([
    ["levi_f", true],
    [" LEVI_F ", true],
    ["levi", false],
    ["", false],
    ["levi_f2", false],
    ["'; DROP TABLE recipes;--", false],
  ])("confirmation %p -> %p", (typed, ok) => {
    expect(confirmsUsername(typed, "levi_f")).toBe(ok);
  });

  it("marks the field for a wrong password or username", () => {
    expect(deletionFailureView({ ok: false, failedStep: "reauthenticate", error: "invalid_credentials" })).toEqual({
      message: "That password isn't right.",
      field: "password",
      retry: null,
    });
    expect(deletionFailureView({ ok: false, failedStep: "confirm", error: "invalid_input" }).field).toBe("confirmation");
  });

  it("says nothing was deleted when re-authentication fails for another reason", () => {
    const view = deletionFailureView({ ok: false, failedStep: "reauthenticate", error: "offline" });
    expect(view.message).toContain("Nothing was deleted.");
    expect(view.retry).toBe("delete");
  });

  it.each(["delete_data", "release_username", "delete_profile", "delete_auth_user"] as AccountDeletionStep[])(
    "after %s fails, says the deletion is unfinished and offers a retry",
    (failedStep) => {
      const view = deletionFailureView({ ok: false, failedStep, error: "offline" });
      expect(view.message).toBe("You're offline. Your account was only partly deleted. Try again to finish deleting it.");
      expect(view.retry).toBe("delete");
    },
  );

  it("offers to clear the phone again when only the wipe failed", () => {
    expect(deletionFailureView({ ok: false, failedStep: "wipe_local", error: "storage_failed" })).toMatchObject({
      retry: "wipe_local",
    });
  });
});
