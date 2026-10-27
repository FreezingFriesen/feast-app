import { createFirebaseAuthService } from "@/services/auth/firebaseAuthService";
import { createTestDevice, createTestServer } from "@/testing/accountTestBed";
import { createSecurityFlow } from "../securityFlow";

const OLD = "correct horse battery";
const NEW = "staple battery horse";
const form = { email: "levi@example.com", username: "levi_f", password: OLD, confirmPassword: OLD };
const change = { currentPassword: OLD, newPassword: NEW, confirmPassword: NEW };

async function signedIn() {
  const { server, connectivity } = createTestServer();
  const device = createTestDevice(server);
  await device.signUpFlow.signUp(form);
  return { server, connectivity, device };
}

describe("change password", () => {
  it("re-authenticates, then changes the password", async () => {
    const { device } = await signedIn();
    expect(await device.securityFlow.changePassword(change)).toEqual({ ok: true });

    await device.auth.signOut();
    expect(await device.auth.signIn({ email: form.email, password: OLD })).toEqual({
      ok: false,
      error: "invalid_credentials",
    });
    expect(await device.auth.signIn({ email: form.email, password: NEW })).toMatchObject({ ok: true });
  });

  it("puts a wrong current password on that field and changes nothing", async () => {
    const { device } = await signedIn();
    expect(await device.securityFlow.changePassword({ ...change, currentPassword: "wrong password" })).toEqual({
      ok: false,
      error: "invalid_credentials",
      field: "currentPassword",
    });
    await device.auth.signOut();
    expect(await device.auth.signIn({ email: form.email, password: OLD })).toMatchObject({ ok: true });
  });

  it("works even long after logging in, because it always re-authenticates", async () => {
    const { server, device } = await signedIn();
    server.controls.advanceClock(60 * 60 * 1000);
    expect(await device.securityFlow.changePassword(change)).toEqual({ ok: true });
  });

  it.each([
    { newPassword: "short", confirmPassword: "short" },
    { confirmPassword: "different password" },
    { newPassword: OLD, confirmPassword: OLD },
    { currentPassword: "" },
  ])("rejects %p without calling the server", async (patch) => {
    const { device } = await signedIn();
    expect(await device.securityFlow.changePassword({ ...change, ...patch })).toEqual({
      ok: false,
      error: "invalid_input",
    });
  });

  it("reports offline and rate limiting", async () => {
    const { server, connectivity, device } = await signedIn();
    server.controls.failNext("auth.reauthenticate", "rate_limited");
    expect(await device.securityFlow.changePassword(change)).toEqual({ ok: false, error: "rate_limited" });
    connectivity.setOnline(false);
    expect(await device.securityFlow.changePassword(change)).toEqual({ ok: false, error: "offline" });
  });

  it("reports a failure after re-authenticating", async () => {
    const { server, device } = await signedIn();
    server.controls.failNext("auth.changePassword", "offline");
    expect(await device.securityFlow.changePassword(change)).toEqual({ ok: false, error: "offline" });
  });

  it("never includes a password in the result", async () => {
    const { device } = await signedIn();
    const results = [
      await device.securityFlow.changePassword({ ...change, currentPassword: "wrong password" }),
      await device.securityFlow.changePassword(change),
    ];
    expect(JSON.stringify(results)).not.toMatch(/horse|battery|wrong password/);
  });
});

describe("verify password", () => {
  it("accepts the current password", async () => {
    const { device } = await signedIn();
    expect(await device.securityFlow.verifyPassword({ password: OLD })).toEqual({ ok: true });
  });

  it("puts a wrong password on the field", async () => {
    const { device } = await signedIn();
    expect(await device.securityFlow.verifyPassword({ password: "wrong password" })).toEqual({
      ok: false,
      error: "invalid_credentials",
      field: "password",
    });
  });

  it("reports offline and invalid input", async () => {
    const { connectivity, device } = await signedIn();
    expect(await device.securityFlow.verifyPassword({ password: "" })).toEqual({ ok: false, error: "invalid_input" });
    connectivity.setOnline(false);
    expect(await device.securityFlow.verifyPassword({ password: OLD })).toEqual({ ok: false, error: "offline" });
  });
});

describe("resend verification email", () => {
  it("sends it when online", async () => {
    const { device } = await signedIn();
    expect(await device.securityFlow.resendVerificationEmail()).toEqual({ ok: true });
  });

  it("reports offline", async () => {
    const { connectivity, device } = await signedIn();
    connectivity.setOnline(false);
    expect(await device.securityFlow.resendVerificationEmail()).toEqual({ ok: false, error: "offline" });
  });

  it("turns errors thrown by a backend into a result", async () => {
    const flow = createSecurityFlow({ auth: createFirebaseAuthService() });
    expect(await flow.resendVerificationEmail()).toEqual({ ok: false, error: "unknown" });
    expect(await flow.changePassword(change)).toEqual({ ok: false, error: "unknown" });
  });
});
