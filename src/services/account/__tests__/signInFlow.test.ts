import { createFirebaseAuthService } from "@/services/auth/firebaseAuthService";
import { createTestDevice, createTestServer } from "@/testing/accountTestBed";
import { createSignInFlow } from "../signInFlow";

const signUpForm = {
  email: "levi@example.com",
  username: "levi_f",
  password: "correct horse battery",
  confirmPassword: "correct horse battery",
};
const credentials = { email: "levi@example.com", password: "correct horse battery" };

async function setupWithAccount() {
  const { server, connectivity } = createTestServer();
  const phone = createTestDevice(server);
  expect(await phone.signUpFlow.signUp(signUpForm)).toEqual({ status: "signed_up" });
  expect(await phone.logOutFlow.logOut()).toEqual({ ok: true });
  return { server, connectivity, phone };
}

describe("sign in flow (N-14)", () => {
  it("signs in and starts a session", async () => {
    const { phone } = await setupWithAccount();
    expect(await phone.signInFlow.signIn(credentials)).toEqual({ status: "signed_in", profile: "ready" });
    expect(await phone.sessionGuard.check()).toMatchObject({ state: "active" });
  });

  it("restores the profile on a new device (#19)", async () => {
    const { server } = await setupWithAccount();
    const newPhone = createTestDevice(server);
    expect(await newPhone.signInFlow.signIn(credentials)).toEqual({ status: "signed_in", profile: "ready" });
    const uid = newPhone.auth.currentUser()!.uid;
    expect(await newPhone.profiles.get(uid)).toMatchObject({ username: "levi_f" });
  });

  it("keeps a newer local profile over the downloaded one (last edit wins)", async () => {
    const { server } = await setupWithAccount();
    const phone = createTestDevice(server, { wipeOnLogout: false });
    await phone.signInFlow.signIn(credentials);
    const uid = phone.auth.currentUser()!.uid;
    await phone.profiles.setDietaryRestrictions(uid, { allergens: ["sesame"], diets: [] });
    await phone.logOutFlow.logOut();

    await phone.signInFlow.signIn(credentials);
    expect((await phone.profiles.get(uid))?.dietaryRestrictions).toEqual({ allergens: ["sesame"], diets: [] });
  });

  it("reports an account without a username (sign up stopped half way)", async () => {
    const { server } = createTestServer();
    const phone = createTestDevice(server);
    await phone.auth.signUp(credentials);
    await phone.auth.signOut();
    expect(await phone.signInFlow.signIn(credentials)).toEqual({ status: "signed_in", profile: "needs_username" });
  });

  it("signs in even if the profile can't be downloaded right now", async () => {
    const { server } = await setupWithAccount();
    const newPhone = createTestDevice(server);
    server.controls.failNext("profiles.fetch", "offline");
    expect(await newPhone.signInFlow.signIn(credentials)).toEqual({ status: "signed_in", profile: "unavailable" });
  });

  it("gives the same answer for a wrong password and an unknown email, and leaves no session", async () => {
    const { phone } = await setupWithAccount();
    const wrong = await phone.signInFlow.signIn({ ...credentials, password: "wrong password" });
    const unknown = await phone.signInFlow.signIn({ ...credentials, email: "nobody@example.com" });
    expect(wrong).toEqual({ status: "failed", error: "invalid_credentials" });
    expect(unknown).toEqual(wrong);
    expect(phone.auth.currentUser()).toBeNull();
    expect(phone.secure.items.size).toBe(0);
  });

  it.each([
    ["rate_limited", "rate_limited"],
    ["offline", "offline"],
    ["storage_failed", "unknown"],
  ] as const)("maps an injected %s to %s", async (injected, expected) => {
    const { server, phone } = await setupWithAccount();
    server.controls.failNext("auth.signIn", injected);
    expect(await phone.signInFlow.signIn(credentials)).toEqual({ status: "failed", error: expected });
  });

  it("rejects invalid input without calling the server", async () => {
    const { phone } = await setupWithAccount();
    expect(await phone.signInFlow.signIn({ email: "'; DROP TABLE recipes;--", password: "x" })).toEqual({
      status: "failed",
      error: "invalid_input",
    });
  });

  it("turns errors thrown by a backend into a result", async () => {
    const { phone } = await setupWithAccount();
    const flow = createSignInFlow({ ...phone, auth: createFirebaseAuthService() });
    expect(await flow.signIn(credentials)).toEqual({ status: "failed", error: "unknown" });
    expect(await flow.sendPasswordReset({ email: "levi@example.com" })).toEqual({ ok: false, error: "unknown" });
  });
});

describe("password reset (N-16)", () => {
  it("gives the same answer whether or not the account exists", async () => {
    const { phone } = await setupWithAccount();
    const existing = await phone.signInFlow.sendPasswordReset({ email: "levi@example.com" });
    const unknown = await phone.signInFlow.sendPasswordReset({ email: "nobody@example.com" });
    expect(existing).toEqual({ ok: true });
    expect(unknown).toEqual(existing);
  });

  it("reports offline, rate limiting and invalid input", async () => {
    const { server, connectivity, phone } = await setupWithAccount();
    expect(await phone.signInFlow.sendPasswordReset({ email: "<script>" })).toEqual({ ok: false, error: "invalid_input" });
    server.controls.failNext("auth.sendPasswordReset", "rate_limited");
    expect(await phone.signInFlow.sendPasswordReset({ email: "levi@example.com" })).toEqual({
      ok: false,
      error: "rate_limited",
    });
    connectivity.setOnline(false);
    expect(await phone.signInFlow.sendPasswordReset({ email: "levi@example.com" })).toEqual({ ok: false, error: "offline" });
  });
});
