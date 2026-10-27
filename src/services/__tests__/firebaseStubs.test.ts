import { createFirebaseAuthService } from "../auth/firebaseAuthService";
import { isDomainError } from "../domainErrors";
import { createFirebaseRemoteProfileStore } from "../profiles/firebaseRemoteProfileStore";
import { createFirebaseRemoteUserContent } from "../userData/firebaseRemoteUserContent";
import { createFirebaseUsernameRegistry } from "../usernames/firebaseUsernameRegistry";

// Calls a method and returns what it threw or rejected with.
async function failureOf(call: () => unknown): Promise<unknown> {
  try {
    await call();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to fail");
}

const expectNotConfigured = (error: unknown) => {
  expect(isDomainError(error)).toBe(true);
  expect(error).toMatchObject({ code: "backend_not_configured" });
};

describe("Firebase stubs (until the backend exists)", () => {
  const auth = createFirebaseAuthService();
  const usernames = createFirebaseUsernameRegistry();
  const remoteProfiles = createFirebaseRemoteProfileStore();
  const remoteContent = createFirebaseRemoteUserContent();

  it.each([
    ["whenReady", () => auth.whenReady()],
    ["currentUser", () => auth.currentUser()],
    ["subscribe", () => auth.subscribe(() => {})],
    ["signUp", () => auth.signUp({ email: "a@b.co", password: "correct horse" })],
    ["signIn", () => auth.signIn({ email: "a@b.co", password: "x" })],
    ["signOut", () => auth.signOut()],
    ["sendPasswordReset", () => auth.sendPasswordReset({ email: "a@b.co" })],
    ["reauthenticate", () => auth.reauthenticate({ password: "x" })],
    ["changePassword", () => auth.changePassword({ newPassword: "correct horse" })],
    ["deleteAuthUser", () => auth.deleteAuthUser()],
    ["sendVerificationEmail", () => auth.sendVerificationEmail()],
    ["isAvailable", () => usernames.isAvailable("levi_f")],
    ["claim", () => usernames.claim("Xy3kP9qLmN2vB7cD1eF4gH6jK8l0", "levi_f")],
    ["release", () => usernames.release("Xy3kP9qLmN2vB7cD1eF4gH6jK8l0", "levi_f")],
    ["fetch", () => remoteProfiles.fetch("Xy3kP9qLmN2vB7cD1eF4gH6jK8l0")],
    ["delete profile", () => remoteProfiles.delete("Xy3kP9qLmN2vB7cD1eF4gH6jK8l0")],
    ["deleteAll content", () => remoteContent.deleteAll("Xy3kP9qLmN2vB7cD1eF4gH6jK8l0")],
  ])("%s fails with backend_not_configured", async (_name, call) => {
    expectNotConfigured(await failureOf(call));
  });
});
