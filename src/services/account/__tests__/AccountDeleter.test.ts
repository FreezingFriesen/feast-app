import type { InMemoryOperation } from "@/services/backend/inMemoryServer";
import { createTestDevice, createTestServer } from "@/testing/accountTestBed";

const EMAIL = "levi@example.com";
const USERNAME = "levi_f";
const PASSWORD = "correct horse battery";
const signUpForm = { email: EMAIL, username: USERNAME, password: PASSWORD, confirmPassword: PASSWORD };
const confirmed = { password: PASSWORD, confirmation: USERNAME };

async function setup() {
  const { server, connectivity } = createTestServer();
  const device = createTestDevice(server);
  expect(await device.signUpFlow.signUp(signUpForm)).toEqual({ status: "signed_up" });
  const uid = device.auth.currentUser()!.uid;
  // Synced recipes and meal plans, as the sync engine will store them.
  server.state.userContent.set(uid, new Set(["recipes/r1", "mealPlanEntries/e1"]));
  return { server, connectivity, device, uid };
}

type Context = Awaited<ReturnType<typeof setup>>;

// Nothing of the account is left on the server or the phone.
async function expectFullyDeleted({ server, device, uid }: Context) {
  expect(server.state.accounts.has(EMAIL)).toBe(false);
  expect(server.state.usernames.has(USERNAME)).toBe(false);
  expect(server.state.users.has(uid)).toBe(false);
  expect(server.state.userContent.has(uid)).toBe(false);
  expect(device.auth.currentUser()).toBeNull();
  expect(await device.profiles.get(uid)).toBeUndefined();
  expect(device.secure.items.size).toBe(0);
}

// Everything is still there and the user is still signed in.
async function expectUntouched({ server, device, uid }: Context) {
  expect(server.state.accounts.has(EMAIL)).toBe(true);
  expect(server.state.usernames.get(USERNAME)).toBe(uid);
  expect(server.state.users.has(uid)).toBe(true);
  expect(server.state.userContent.get(uid)?.size).toBe(2);
  expect(device.auth.currentUser()?.uid).toBe(uid);
  expect(await device.profiles.get(uid)).toBeDefined();
}

describe("account deletion (N-17)", () => {
  it("deletes the content, username, profile and account, then wipes the phone", async () => {
    const context = await setup();
    expect(await context.device.accountDeleter.deleteAccount(confirmed)).toEqual({ ok: true });
    await expectFullyDeleted(context);
  });

  it("frees the email and the username for new accounts", async () => {
    const context = await setup();
    await context.device.accountDeleter.deleteAccount(confirmed);
    const newPhone = createTestDevice(context.server);
    expect(await newPhone.signUpFlow.signUp(signUpForm)).toEqual({ status: "signed_up" });
  });

  it("accepts the username in any letter case", async () => {
    const context = await setup();
    expect(await context.device.accountDeleter.deleteAccount({ ...confirmed, confirmation: " LEVI_F " })).toEqual({
      ok: true,
    });
  });

  describe("deletes nothing when", () => {
    it.each([
      ["the typed username doesn't match", { confirmation: "someone_else" }],
      ["the confirmation is empty", { confirmation: "" }],
      ["the confirmation is an attack string", { confirmation: "'; DROP TABLE recipes;--" }],
      ["the password is missing", { password: "" }],
    ])("%s", async (_label, patch) => {
      const context = await setup();
      expect(await context.device.accountDeleter.deleteAccount({ ...confirmed, ...patch })).toEqual({
        ok: false,
        failedStep: "confirm",
        error: "invalid_input",
      });
      await expectUntouched(context);
    });

    it("the password is wrong", async () => {
      const context = await setup();
      expect(await context.device.accountDeleter.deleteAccount({ ...confirmed, password: "wrong password" })).toEqual({
        ok: false,
        failedStep: "reauthenticate",
        error: "invalid_credentials",
      });
      await expectUntouched(context);
    });

    it("the phone is offline", async () => {
      const context = await setup();
      context.connectivity.setOnline(false);
      expect(await context.device.accountDeleter.deleteAccount(confirmed)).toEqual({
        ok: false,
        failedStep: "reauthenticate",
        error: "offline",
      });
      await expectUntouched(context);
    });

    it("nobody is signed in", async () => {
      const context = await setup();
      await context.device.auth.signOut();
      expect(await context.device.accountDeleter.deleteAccount(confirmed)).toEqual({
        ok: false,
        failedStep: "confirm",
        error: "requires_recent_login",
      });
      expect(context.server.state.accounts.has(EMAIL)).toBe(true);
    });
  });

  describe("failing half way, then retrying", () => {
    it.each([
      ["reauthenticate", "auth.reauthenticate"],
      ["delete_data", "content.deleteAll"],
      ["release_username", "profiles.fetch"],
      ["release_username", "usernames.release"],
      ["delete_profile", "profiles.delete"],
      ["delete_auth_user", "auth.deleteUser"],
    ] as const)("stops at %s when %s fails, and a retry finishes", async (step, operation: InMemoryOperation) => {
      const context = await setup();
      context.server.controls.failNext(operation, "offline");

      expect(await context.device.accountDeleter.deleteAccount(confirmed)).toEqual({
        ok: false,
        failedStep: step,
        error: "offline",
      });
      // The user is still signed in with the profile on the phone, so they can retry.
      expect(context.device.auth.currentUser()?.uid).toBe(context.uid);
      expect(await context.device.profiles.get(context.uid)).toBeDefined();

      expect(await context.device.accountDeleter.deleteAccount(confirmed)).toEqual({ ok: true });
      await expectFullyDeleted(context);
    });

    it("finishes when the account needed a fresh login for the last step", async () => {
      const context = await setup();
      context.server.controls.failNext("auth.deleteUser", "requires_recent_login");
      expect(await context.device.accountDeleter.deleteAccount(confirmed)).toMatchObject({
        failedStep: "delete_auth_user",
        error: "requires_recent_login",
      });
      expect(await context.device.accountDeleter.deleteAccount(confirmed)).toEqual({ ok: true });
      await expectFullyDeleted(context);
    });

    it("doesn't take back a username someone else claimed in the meantime", async () => {
      const context = await setup();
      context.server.controls.failNext("profiles.delete", "offline");
      await context.device.accountDeleter.deleteAccount(confirmed);
      expect(context.server.state.usernames.has(USERNAME)).toBe(false);

      // Someone else claims the released name before the retry.
      context.server.state.usernames.set(USERNAME, "SomeoneElse123");
      expect(await context.device.accountDeleter.deleteAccount(confirmed)).toEqual({ ok: true });
      expect(context.server.state.usernames.get(USERNAME)).toBe("SomeoneElse123");
      expect(context.server.state.users.has(context.uid)).toBe(false);
    });

    it("reports a failed phone wipe after the account is gone, and the wipe can be retried", async () => {
      const context = await setup();
      jest.spyOn(context.device.profiles, "clear").mockRejectedValueOnce(new Error("disk full"));

      expect(await context.device.accountDeleter.deleteAccount(confirmed)).toEqual({
        ok: false,
        failedStep: "wipe_local",
        error: "storage_failed",
      });
      // The account itself is deleted and signed out.
      expect(context.server.state.accounts.has(EMAIL)).toBe(false);
      expect(context.device.auth.currentUser()).toBeNull();
      expect(await context.device.profiles.get(context.uid)).toBeDefined();

      await context.device.localData.wipe();
      await expectFullyDeleted(context);
    });
  });

  it("never includes the password in a result", async () => {
    const context = await setup();
    const results = [
      await context.device.accountDeleter.deleteAccount({ ...confirmed, password: "wrong password" }),
      await context.device.accountDeleter.deleteAccount({ ...confirmed, confirmation: "nope_nope" }),
      await context.device.accountDeleter.deleteAccount(confirmed),
    ];
    expect(JSON.stringify(results)).not.toMatch(/horse|battery|wrong password/);
  });
});
