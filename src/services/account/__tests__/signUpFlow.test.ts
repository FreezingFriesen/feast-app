import { createTestDevice, createTestServer } from "@/testing/accountTestBed";

const form = {
  email: "Levi@Example.com",
  username: "Levi_F",
  password: "correct horse battery",
  confirmPassword: "correct horse battery",
};
const signInWith = { email: "levi@example.com", password: form.password };

function setup() {
  const { server, connectivity } = createTestServer();
  return { server, connectivity, device: createTestDevice(server) };
}

describe("sign up flow (N-13)", () => {
  it("creates the account, claims the username, caches the profile and starts the session", async () => {
    const { server, device } = setup();
    expect(await device.signUpFlow.signUp(form)).toEqual({ status: "signed_up" });

    const user = device.auth.currentUser();
    expect(user).toMatchObject({ email: "levi@example.com" });
    expect(await device.profiles.get(user!.uid)).toMatchObject({ username: "levi_f", dietaryRestrictions: null });
    expect(server.state.usernames.get("levi_f")).toBe(user!.uid);
    expect(await device.sessionGuard.check()).toMatchObject({ state: "active" });
  });

  it("records the login date before the user appears, so the app-wide check never signs them out", async () => {
    const { device } = setup();
    const checks: Promise<unknown>[] = [];
    device.auth.subscribe((user) => {
      if (user) checks.push(device.sessionGuard.check());
    });
    await device.signUpFlow.signUp(form);
    expect(await Promise.all(checks)).toEqual([expect.objectContaining({ state: "active" })]);
    expect(device.auth.currentUser()).not.toBeNull();
  });

  it.each([
    { password: "short", confirmPassword: "short" },
    { confirmPassword: "something else" },
    { username: "'; DROP TABLE recipes;--" },
    { email: "<script>alert(1)</script>" },
  ])("rejects invalid input %p without creating anything", async (patch) => {
    const { server, device } = setup();
    expect(await device.signUpFlow.signUp({ ...form, ...patch })).toEqual({ status: "failed", error: "invalid_input" });
    expect(server.state.accounts.size).toBe(0);
    expect(device.secure.items.size).toBe(0);
  });

  it("stops before creating an account when the username is taken, in any case", async () => {
    const { server, device } = setup();
    await device.signUpFlow.signUp(form);
    await device.logOutFlow.logOut();

    const other = { ...form, email: "someone@example.com", username: "LEVI_F" };
    expect(await device.signUpFlow.signUp(other)).toEqual({ status: "failed", error: "taken" });
    expect(server.state.accounts.has("someone@example.com")).toBe(false);
  });

  it("does not reveal that an email is already registered", async () => {
    const { device } = setup();
    await device.signUpFlow.signUp(form);
    await device.logOutFlow.logOut();
    expect(await device.signUpFlow.signUp({ ...form, username: "other_name" })).toEqual({
      status: "failed",
      error: "sign_up_failed",
    });
    expect(device.auth.currentUser()).toBeNull();
    expect(await device.sessionStore.getLoginAt()).toBeNull();
  });

  it("reports offline before doing anything", async () => {
    const { server, connectivity, device } = setup();
    connectivity.setOnline(false);
    expect(await device.signUpFlow.signUp(form)).toEqual({ status: "failed", error: "offline" });
    expect(server.state.accounts.size).toBe(0);
  });

  describe("failure halfway through", () => {
    it("undoes the account when the username claim fails, so the user can try again", async () => {
      const { server, device } = setup();
      server.controls.failNext("usernames.claim", "offline");

      expect(await device.signUpFlow.signUp(form)).toEqual({ status: "failed", error: "offline" });
      expect(device.auth.currentUser()).toBeNull();
      expect(server.state.accounts.size).toBe(0);
      expect(server.state.usernames.size).toBe(0);
      expect(await device.sessionStore.getLoginAt()).toBeNull();

      // Trying again works, with the same email and username.
      expect(await device.signUpFlow.signUp(form)).toEqual({ status: "signed_up" });
    });

    it("undoes the account when someone else claims the name first", async () => {
      const { server, device } = setup();
      server.controls.failNext("usernames.claim", "taken");
      expect(await device.signUpFlow.signUp(form)).toEqual({ status: "failed", error: "taken" });
      expect(server.state.accounts.size).toBe(0);
    });

    it("leaves nothing half-written when the claim fails while committing", async () => {
      const { server, device } = setup();
      server.controls.failNext("usernames.claimCommit");
      expect(await device.signUpFlow.signUp(form)).toEqual({ status: "failed", error: "unknown" });
      expect(server.state.usernames.size).toBe(0);
      expect(server.state.users.size).toBe(0);
      expect(server.state.accounts.size).toBe(0);
    });

    it("asks for a username again when the account can't be undone either", async () => {
      const { server, device } = setup();
      server.controls.failNext("usernames.claim", "offline");
      server.controls.failNext("auth.deleteUser", "offline");

      expect(await device.signUpFlow.signUp(form)).toEqual({ status: "needs_username", error: "offline" });
      const user = device.auth.currentUser();
      expect(user).not.toBeNull();
      expect(await device.profiles.get(user!.uid)).toBeUndefined();
      // Still a valid session, so the user isn't signed out while choosing a name.
      expect(await device.sessionGuard.check()).toMatchObject({ state: "active" });

      expect(await device.signUpFlow.chooseUsername({ username: "Levi_F" })).toEqual({ ok: true });
      expect(await device.profiles.get(user!.uid)).toMatchObject({ username: "levi_f" });
    });
  });

  describe("chooseUsername", () => {
    it("needs a signed-in user", async () => {
      const { device } = setup();
      expect(await device.signUpFlow.chooseUsername({ username: "levi_f" })).toEqual({
        ok: false,
        error: "requires_recent_login",
      });
    });

    it("rejects invalid and taken names", async () => {
      const { device } = setup();
      await device.signUpFlow.signUp(form);
      await device.logOutFlow.logOut();
      await device.auth.signUp({ email: "orphan@example.com", password: form.password });

      expect(await device.signUpFlow.chooseUsername({ username: "a b" })).toEqual({ ok: false, error: "invalid_input" });
      expect(await device.signUpFlow.chooseUsername({ username: "LEVI_F" })).toEqual({ ok: false, error: "taken" });
      expect(await device.signUpFlow.chooseUsername({ username: "orphan_1" })).toEqual({ ok: true });
    });
  });

  it("never includes the password in a result", async () => {
    const { server, device } = setup();
    server.controls.failNext("usernames.claim", "offline");
    server.controls.failNext("auth.deleteUser", "offline");
    const results = [await device.signUpFlow.signUp(form), await device.signUpFlow.signUp(form)];
    expect(JSON.stringify(results)).not.toContain(form.password);
    expect(await device.signInFlow.signIn(signInWith)).toMatchObject({ status: "signed_in" });
  });
});
