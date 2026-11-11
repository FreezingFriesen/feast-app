// What the emulator can't show: error mapping, and exactly what reaches the SDK.
// The real behaviour is proven by the contract suite (npm run test:backend).
import { createFirebaseAuthService } from "../firebaseAuthService";

jest.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: jest.fn(),
  deleteUser: jest.fn(),
  EmailAuthProvider: { credential: jest.fn() },
  onAuthStateChanged: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  updatePassword: jest.fn(),
}));

type Mocked = Record<string, jest.Mock> & { EmailAuthProvider: { credential: jest.Mock } };
const sdk = jest.requireMock<Mocked>("firebase/auth");

const USER = { uid: "Xy3kP9qLmN2vB7cD1eF4gH6jK8l0", email: "levi@example.com", emailVerified: false };
const PASSWORD = "correct horse battery";
const authError = (code: string) => Object.assign(new Error(`Firebase: ${code} levi@example.com`), { code });

// A pretend Firebase auth object, and a way to fire its onAuthStateChanged report.
function setup({ signedIn = false }: { signedIn?: boolean } = {}) {
  jest.resetAllMocks();
  const auth = { currentUser: signedIn ? USER : null } as { currentUser: typeof USER | null };
  let report: () => void = () => {};
  let reportError: () => void = () => {};
  sdk.onAuthStateChanged.mockImplementation((_auth: unknown, next: () => void, error: () => void) => {
    report = next;
    reportError = error;
    return () => {};
  });
  const service = createFirebaseAuthService({ client: { auth } as never });
  return {
    auth,
    service,
    report: () => report(),
    reportError: () => reportError(),
    // Firebase changes who is signed in, then the call resolves.
    signInWith: (user: typeof USER) => {
      auth.currentUser = user;
      return { user };
    },
  };
}

const NO_SDK_CALLS = [
  "createUserWithEmailAndPassword",
  "signInWithEmailAndPassword",
  "sendPasswordResetEmail",
  "reauthenticateWithCredential",
  "updatePassword",
];
const expectNoSdkCalls = () => NO_SDK_CALLS.forEach((name) => expect(sdk[name]).not.toHaveBeenCalled());

describe("whenReady", () => {
  it("waits for Firebase's first report, then has the restored user", async () => {
    const { service, auth, report } = setup();
    let ready = false;
    service.whenReady().then(() => {
      ready = true;
    });
    await Promise.resolve();
    expect(ready).toBe(false);

    auth.currentUser = USER;
    report();
    await service.whenReady();
    expect(service.currentUser()).toEqual(USER);
  });

  it("doesn't get stuck if the report is an error", async () => {
    const { service, reportError } = setup();
    reportError();
    await expect(service.whenReady()).resolves.toBeUndefined();
    expect(service.currentUser()).toBeNull();
  });
});

describe("currentUser and subscribe", () => {
  it("keeps the same object until the user changes, then tells listeners", () => {
    const { service, auth, report } = setup();
    const listener = jest.fn();
    service.subscribe(listener);

    auth.currentUser = USER;
    report();
    const first = service.currentUser();
    report(); // the same user again
    expect(service.currentUser()).toBe(first);
    expect(listener).toHaveBeenCalledTimes(1);

    auth.currentUser = { ...USER, emailVerified: true };
    report();
    expect(service.currentUser()).not.toBe(first);
    expect(service.currentUser()).toMatchObject({ emailVerified: true });
    expect(listener).toHaveBeenCalledTimes(2);

    auth.currentUser = null;
    report();
    expect(service.currentUser()).toBeNull();
    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it("stops telling a listener once it unsubscribes", () => {
    const { service, auth, report } = setup();
    const kept = jest.fn();
    const removed = jest.fn();
    service.subscribe(kept);
    const unsubscribe = service.subscribe(removed);
    unsubscribe();

    auth.currentUser = USER;
    report();
    expect(kept).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
  });

  it("only exposes the three user fields, never tokens", async () => {
    const { service, signInWith } = setup();
    const firebaseUser = { ...USER, accessToken: "secret-token", refreshToken: "secret-refresh", getIdToken: jest.fn() };
    sdk.createUserWithEmailAndPassword.mockImplementation(async () => signInWith(firebaseUser));
    const result = await service.signUp({ email: USER.email, password: PASSWORD });
    expect(result).toEqual({ ok: true, user: USER });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("is right as soon as the call returns, even before Firebase reports it, and a late report changes nothing", async () => {
    const { service, signInWith, report } = setup();
    const listener = jest.fn();
    service.subscribe(listener);
    sdk.signInWithEmailAndPassword.mockImplementation(async () => signInWith(USER));

    await service.signIn({ email: USER.email, password: PASSWORD });
    expect(service.currentUser()).toEqual(USER);
    const first = service.currentUser();

    report();
    expect(service.currentUser()).toBe(first);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("input is checked before the SDK is called", () => {
  it.each([
    ["signUp", { email: "nope", password: PASSWORD }],
    ["signUp", { email: USER.email, password: "short" }],
    ["signUp", { email: "'; DROP TABLE recipes;--", password: PASSWORD }],
    ["signUp", null],
    ["signIn", { email: "<script>alert(1)</script>", password: PASSWORD }],
    ["signIn", { email: USER.email, password: "" }],
    ["sendPasswordReset", { email: "nope" }],
    ["reauthenticate", { password: "" }],
    ["changePassword", { newPassword: "short" }],
  ] as const)("%s(%j) -> invalid_input", async (method, input) => {
    const { service } = setup({ signedIn: true });
    expect(await service[method](input)).toEqual({ ok: false, error: "invalid_input" });
    expectNoSdkCalls();
  });

  it("sends the cleaned, lowercased email to the SDK", async () => {
    const { service, auth, signInWith } = setup();
    sdk.createUserWithEmailAndPassword.mockImplementation(async () => signInWith(USER));
    await service.signUp({ email: "  Levi@Example.COM ", password: PASSWORD });
    expect(sdk.createUserWithEmailAndPassword).toHaveBeenCalledWith(auth, USER.email, PASSWORD);
  });
});

describe("error mapping", () => {
  it.each([
    ["auth/email-already-in-use", "sign_up_failed"],
    ["auth/weak-password", "sign_up_failed"],
    ["auth/network-request-failed", "offline"],
    ["auth/too-many-requests", "rate_limited"],
    ["auth/internal-error", "unknown"],
  ])("signUp: %s -> %s", async (code, expected) => {
    const { service } = setup();
    sdk.createUserWithEmailAndPassword.mockRejectedValue(authError(code));
    expect(await service.signUp({ email: USER.email, password: PASSWORD })).toEqual({ ok: false, error: expected });
  });

  it.each([
    ["auth/invalid-credential", "invalid_credentials"],
    ["auth/wrong-password", "invalid_credentials"],
    ["auth/user-not-found", "invalid_credentials"],
    ["auth/too-many-requests", "rate_limited"],
    ["auth/network-request-failed", "offline"],
    ["auth/user-disabled", "unknown"],
  ])("signIn: %s -> %s", async (code, expected) => {
    const { service } = setup();
    sdk.signInWithEmailAndPassword.mockRejectedValue(authError(code));
    expect(await service.signIn({ email: USER.email, password: PASSWORD })).toEqual({ ok: false, error: expected });
    expect(service.currentUser()).toBeNull();
  });

  it.each([
    ["auth/wrong-password", "invalid_credentials"],
    ["auth/too-many-requests", "rate_limited"],
    ["auth/network-request-failed", "offline"],
  ])("reauthenticate: %s -> %s", async (code, expected) => {
    const { service } = setup({ signedIn: true });
    sdk.reauthenticateWithCredential.mockRejectedValue(authError(code));
    expect(await service.reauthenticate({ password: PASSWORD })).toEqual({ ok: false, error: expected });
  });

  it.each([
    ["changePassword", "updatePassword", { newPassword: PASSWORD }],
    ["deleteAuthUser", "deleteUser", undefined],
  ] as const)("%s: asks for a recent login", async (method, sdkName, input) => {
    const { service } = setup({ signedIn: true });
    sdk[sdkName].mockRejectedValue(authError("auth/requires-recent-login"));
    expect(await (service[method] as (value: unknown) => Promise<unknown>)(input)).toEqual({
      ok: false,
      error: "requires_recent_login",
    });
  });

  it("never passes Firebase's message on", async () => {
    const { service } = setup();
    sdk.signInWithEmailAndPassword.mockRejectedValue(authError("auth/internal-error"));
    expect(JSON.stringify(await service.signIn({ email: USER.email, password: PASSWORD }))).not.toContain("example.com");
  });
});

describe("password reset", () => {
  it("gives the same answer whether or not the account exists", async () => {
    const { service } = setup();
    sdk.sendPasswordResetEmail.mockResolvedValueOnce(undefined);
    const existing = await service.sendPasswordReset({ email: USER.email });
    sdk.sendPasswordResetEmail.mockRejectedValueOnce(authError("auth/user-not-found"));
    const unknown = await service.sendPasswordReset({ email: "nobody@example.com" });
    expect(existing).toEqual({ ok: true });
    expect(unknown).toEqual(existing);
  });

  it("still reports offline and rate limiting", async () => {
    const { service } = setup();
    sdk.sendPasswordResetEmail.mockRejectedValueOnce(authError("auth/network-request-failed"));
    expect(await service.sendPasswordReset({ email: USER.email })).toEqual({ ok: false, error: "offline" });
    sdk.sendPasswordResetEmail.mockRejectedValueOnce(authError("auth/too-many-requests"));
    expect(await service.sendPasswordReset({ email: USER.email })).toEqual({ ok: false, error: "rate_limited" });
  });

  it("reports an email Firebase finds badly formed as invalid input", async () => {
    const { service } = setup();
    sdk.sendPasswordResetEmail.mockRejectedValueOnce(authError("auth/invalid-email"));
    expect(await service.sendPasswordReset({ email: USER.email })).toEqual({ ok: false, error: "invalid_input" });
  });
});

describe("nobody signed in", () => {
  it.each([
    ["reauthenticate", { password: PASSWORD }],
    ["changePassword", { newPassword: PASSWORD }],
    ["deleteAuthUser", undefined],
    ["sendVerificationEmail", undefined],
  ] as const)("%s -> requires_recent_login, like the in-memory service", async (method, input) => {
    const { service } = setup();
    expect(await (service[method] as (value: unknown) => Promise<unknown>)(input)).toEqual({
      ok: false,
      error: "requires_recent_login",
    });
  });
});

describe("signed-in actions", () => {
  it("re-authenticates with the user's email and the given password", async () => {
    const { service, auth } = setup({ signedIn: true });
    sdk.EmailAuthProvider.credential.mockReturnValue("credential");
    expect(await service.reauthenticate({ password: PASSWORD })).toEqual({ ok: true });
    expect(sdk.EmailAuthProvider.credential).toHaveBeenCalledWith(USER.email, PASSWORD);
    expect(sdk.reauthenticateWithCredential).toHaveBeenCalledWith(auth.currentUser, "credential");
  });

  it("deleting the login clears the user", async () => {
    const { service, auth, report } = setup({ signedIn: true });
    report();
    expect(await service.deleteAuthUser()).toEqual({ ok: true });
    expect(sdk.deleteUser).toHaveBeenCalledWith(auth.currentUser);
    expect(service.currentUser()).toBeNull();
  });

  it("signing out clears the user, and a failure is a domain error", async () => {
    const { service, report } = setup({ signedIn: true });
    report();
    await service.signOut();
    expect(service.currentUser()).toBeNull();

    sdk.signOut.mockRejectedValueOnce(authError("auth/internal-error"));
    await expect(service.signOut()).rejects.toMatchObject({ name: "DomainError", code: "unknown" });
  });
});
