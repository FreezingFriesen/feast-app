// The auth gate (N-14, N-15): which screens the app shows. The rules are pure, and the
// session results come from the real session guard, auth service and account flows
// (in memory, with a fake clock), wired the way the app wires them.
import { createInMemoryAuthService } from "@/services/auth/inMemoryAuthService";
import type { AuthService } from "@/services/auth/AuthService";
import { createInMemoryServer } from "@/services/backend/inMemoryServer";
import { createSecureSessionStore, type SecureSessionStore } from "@/services/session/SecureSessionStore";
import { createSessionGuard, type SessionCheck, type SessionGuard } from "@/services/session/sessionGuard";
import { createSessionPolicy } from "@/services/session/SessionPolicy";
import { createTestDevice, createTestServer } from "@/testing/accountTestBed";
import { createFakeConnectivity } from "@/testing/fakes/fakeConnectivity";
import { createMemorySecureKeyValue } from "@/testing/fakes/memorySecureKeyValue";
import { deriveAuthRoute, notFoundRedirect, type AuthGateInput, type AuthRoute, type SessionGateState } from "../gate/authGate";
import { INITIAL_SESSION_GATE, reduceSessionGate, type SessionGateModel } from "../gate/sessionGateState";
import { ACCOUNT_DELETED_MESSAGE, welcomeNotice } from "../gate/welcomeNotice";

const DAY = 24 * 60 * 60 * 1000;
const LOGIN = Date.UTC(2026, 10, 1, 12, 0);
const CREDENTIALS = { email: "levi@example.com", password: "correct horse battery" };
const ROUTES: AuthRoute[] = ["splash", "welcome", "username", "app"];

const active = (expiresAt = LOGIN + 30 * DAY): SessionCheck => ({ state: "active", expiresAt });
const checked = (uid: string | null, check: SessionCheck): SessionGateState => ({ status: "checked", uid, check });

function input(patch: Partial<AuthGateInput> = {}): AuthGateInput {
  return {
    uid: "user1",
    session: checked("user1", active()),
    profile: "ready",
    authInProgress: false,
    ...patch,
  };
}

// What useSessionCheck does: run the check for whoever is signed in, and run it again
// whenever that changes (the check's own sign out changes it), until it settles.
async function settle(guard: SessionGuard, auth: AuthService, model: SessionGateModel = INITIAL_SESSION_GATE) {
  let next = model;
  for (let run = 0; run < 3; run += 1) {
    const uid = auth.currentUser()?.uid ?? null;
    try {
      const check = await guard.check();
      const current = (auth.currentUser()?.uid ?? null) === uid;
      next = reduceSessionGate(next, { type: "result", uid, check, current });
      if (current) return next;
    } catch {
      return reduceSessionGate(next, { type: "error", uid, current: true });
    }
  }
  throw new Error("The session check never settled");
}

// The route at start (previous = "splash"), or from the screen the user is on.
function routeFor(auth: AuthService, model: SessionGateModel, previous: AuthRoute = "splash") {
  return deriveAuthRoute(
    { uid: auth.currentUser()?.uid ?? null, session: model.gate, profile: "ready", authInProgress: false },
    previous,
  );
}

// A phone with a fake clock, signed in at LOGIN.
async function phone({ store }: { store?: (real: SecureSessionStore) => SecureSessionStore } = {}) {
  let time = LOGIN;
  const now = () => time;
  const connectivity = createFakeConnectivity(true);
  const server = createInMemoryServer({ connectivity: connectivity.service, now });
  const auth = createInMemoryAuthService(server);
  const real = createSecureSessionStore(createMemorySecureKeyValue().store);
  const wiper = { wipe: jest.fn(async () => {}) };
  const guard = createSessionGuard({
    auth,
    store: store ? store(real) : real,
    policy: createSessionPolicy(now),
    wiper,
    now,
  });
  await real.setLoginAt(LOGIN);
  await auth.signUp(CREDENTIALS);
  return { auth, guard, wiper, connectivity, setTime: (value: number) => (time = value) };
}

describe("deriveAuthRoute", () => {
  it("keeps the splash while the first session check is running (restoring a session)", () => {
    for (const previous of ROUTES) {
      expect(deriveAuthRoute(input({ session: { status: "checking" } }), previous)).toBe("splash");
    }
  });

  it("shows the welcome screen when nobody is signed in", () => {
    expect(deriveAuthRoute(input({ uid: null, session: checked(null, { state: "signed_out" }) }), "splash")).toBe(
      "welcome",
    );
    expect(deriveAuthRoute(input({ uid: null, session: checked(null, { state: "signed_out" }) }), "app")).toBe(
      "welcome",
    );
  });

  it("fails closed when the check threw", () => {
    for (const previous of ROUTES) {
      expect(deriveAuthRoute(input({ session: { status: "failed", uid: "user1" } }), previous)).toBe("welcome");
    }
  });

  it("never lets in a session that hasn't been confirmed for this user", () => {
    // Just signed in: the last result is still the signed-out one.
    expect(deriveAuthRoute(input({ session: checked(null, { state: "signed_out" }) }), "welcome")).toBe("welcome");
    // Another user's result.
    expect(deriveAuthRoute(input({ session: checked("someone_else", active()) }), "app")).toBe("welcome");
    // Ended for this user (the sign out is on its way).
    expect(deriveAuthRoute(input({ session: checked("user1", { state: "ended", reason: "expired" }) }), "app")).toBe(
      "welcome",
    );
    // At start the splash stays up instead.
    expect(deriveAuthRoute(input({ session: checked(null, { state: "signed_out" }) }), "splash")).toBe("splash");
  });

  it("shows the tabs for a confirmed session with a profile, or one that can't be downloaded offline", () => {
    expect(deriveAuthRoute(input({ profile: "ready" }), "splash")).toBe("app");
    expect(deriveAuthRoute(input({ profile: "unavailable" }), "welcome")).toBe("app");
  });

  it("shows the username step when the account has no username", () => {
    expect(deriveAuthRoute(input({ profile: "needs_username" }), "splash")).toBe("username");
    expect(deriveAuthRoute(input({ profile: "needs_username" }), "app")).toBe("username");
  });

  it("keeps the current screen while the profile loads, and the splash at start", () => {
    expect(deriveAuthRoute(input({ profile: "loading" }), "splash")).toBe("splash");
    expect(deriveAuthRoute(input({ profile: "loading" }), "welcome")).toBe("welcome");
    expect(deriveAuthRoute(input({ profile: "loading" }), "username")).toBe("username");
    expect(deriveAuthRoute(input({ profile: "loading" }), "app")).toBe("app");
  });

  it("holds the auth screens while a log in or sign up is running, even when the user has appeared", () => {
    // Sign up part way: signed in, no username saved yet.
    expect(deriveAuthRoute(input({ authInProgress: true, profile: "needs_username" }), "welcome")).toBe("welcome");
    expect(deriveAuthRoute(input({ authInProgress: true, profile: "ready" }), "welcome")).toBe("welcome");
    // Saving a username: stays on the username step.
    expect(deriveAuthRoute(input({ authInProgress: true, profile: "ready" }), "username")).toBe("username");
    // A hold never opens the tabs.
    for (const previous of ROUTES) {
      expect(deriveAuthRoute(input({ authInProgress: true }), previous)).not.toBe("app");
    }
  });

  it("treats a profile that says signed out as signed out", () => {
    expect(deriveAuthRoute(input({ profile: "signed_out" }), "app")).toBe("welcome");
  });

  it("only ever returns app from a confirmed active session for the signed-in user", () => {
    const sessions: SessionGateState[] = [
      { status: "checking" },
      { status: "failed", uid: "user1" },
      checked("user1", { state: "signed_out" }),
      checked("user1", { state: "ended", reason: "expired" }),
      checked("user1", { state: "ended", reason: "missing" }),
      checked("other", active()),
      checked(null, { state: "signed_out" }),
    ];
    const profiles: AuthGateInput["profile"][] = ["signed_out", "loading", "ready", "needs_username", "unavailable"];
    for (const session of sessions) {
      for (const profile of profiles) {
        for (const authInProgress of [false, true]) {
          for (const previous of ROUTES) {
            expect(deriveAuthRoute(input({ session, profile, authInProgress }), previous)).not.toBe("app");
          }
        }
      }
    }
  });

  it("gives the same answer when asked again with its own answer (no loops)", () => {
    const profiles: AuthGateInput["profile"][] = ["loading", "ready", "needs_username", "unavailable"];
    for (const profile of profiles) {
      for (const authInProgress of [false, true]) {
        for (const previous of ROUTES) {
          const once = deriveAuthRoute(input({ profile, authInProgress }), previous);
          expect(deriveAuthRoute(input({ profile, authInProgress }), once)).toBe(once);
        }
      }
    }
  });
});

describe("notFoundRedirect (deep links, Android Back, stale navigation)", () => {
  it("sends a signed-in user on an auth route to the tabs", () => {
    expect(notFoundRedirect("app")).toBe("/recipes");
  });

  it("sends a signed-out user on a tab route to the welcome screen", () => {
    expect(notFoundRedirect("welcome")).toBe("/welcome");
  });

  it("sends an account with no username to the username step, and does nothing under the splash", () => {
    expect(notFoundRedirect("username")).toBe("/choose-username");
    expect(notFoundRedirect("splash")).toBeNull();
  });
});

describe("the gate with the real session check", () => {
  it("shows the tabs for a valid session while offline (no network needed to decide)", async () => {
    const { auth, guard, connectivity, setTime } = await phone();
    connectivity.setOnline(false);
    setTime(LOGIN + DAY);
    expect(routeFor(auth, await settle(guard, auth))).toBe("app");
  });

  it("day 29 → app", async () => {
    const { auth, guard, setTime } = await phone();
    setTime(LOGIN + 29 * DAY);
    expect(routeFor(auth, await settle(guard, auth))).toBe("app");
  });

  it("the last moment of day 30 → app; exactly 30 days (SessionPolicy's boundary) → welcome", async () => {
    const { auth, guard, setTime } = await phone();
    setTime(LOGIN + 30 * DAY - 1);
    expect(routeFor(auth, await settle(guard, auth))).toBe("app");
    setTime(LOGIN + 30 * DAY);
    const model = await settle(guard, auth);
    expect(routeFor(auth, model)).toBe("welcome");
    expect(auth.currentUser()).toBeNull();
  });

  it("day 31 → welcome, with the expired message, and local data kept", async () => {
    const { auth, guard, wiper, setTime } = await phone();
    setTime(LOGIN + 31 * DAY);
    const model = await settle(guard, auth);
    expect(routeFor(auth, model)).toBe("welcome");
    // The check signed the user out itself, which changed the uid while it was
    // finishing; the reason is kept anyway.
    expect(model.ended).toEqual({ state: "ended", reason: "expired" });
    expect(welcomeNotice(null, model.ended)?.message).toMatch(/30 days/);
    expect(wiper.wipe).not.toHaveBeenCalled();
  });

  it("a check that throws → welcome, and nothing is wiped", async () => {
    const { auth, guard, wiper } = await phone({
      store: (real) => ({
        ...real,
        getLoginAt: async () => {
          throw new Error("secure storage unavailable");
        },
      }),
    });
    const model = await settle(guard, auth);
    expect(model.gate).toEqual({ status: "failed", uid: auth.currentUser()?.uid });
    expect(routeFor(auth, model)).toBe("welcome");
    expect(wiper.wipe).not.toHaveBeenCalled();
  });

  it("no saved session (a fresh install, or a reload on the memory backend) → welcome", async () => {
    const connectivity = createFakeConnectivity(true);
    const auth = createInMemoryAuthService(createInMemoryServer({ connectivity: connectivity.service }));
    const guard = createSessionGuard({
      auth,
      store: createSecureSessionStore(createMemorySecureKeyValue().store),
      policy: createSessionPolicy(),
      wiper: { wipe: async () => {} },
    });
    await auth.whenReady();
    const model = await settle(guard, auth);
    expect(model.gate).toEqual({ status: "checked", uid: null, check: { state: "signed_out" } });
    expect(routeFor(auth, model)).toBe("welcome");
  });
});

describe("the gate with the real account flows", () => {
  const PASSWORD = "correct horse battery";
  const signUpForm = { email: "levi@example.com", username: "levi_f", password: PASSWORD, confirmPassword: PASSWORD };

  async function signedUpDevice() {
    const { server } = createTestServer();
    const device = createTestDevice(server);
    expect(await device.signUpFlow.signUp(signUpForm)).toEqual({ status: "signed_up" });
    const model = await settle(device.sessionGuard, device.auth);
    expect(routeFor(device.auth, model)).toBe("app");
    return { device, model };
  }

  it("log out → welcome", async () => {
    const { device, model } = await signedUpDevice();
    expect(await device.logOutFlow.logOut()).toEqual({ ok: true });
    expect(routeFor(device.auth, await settle(device.sessionGuard, device.auth, model), "app")).toBe("welcome");
  });

  it("delete account → welcome, with the deleted message", async () => {
    const { device, model } = await signedUpDevice();
    expect(await device.accountDeleter.deleteAccount({ password: PASSWORD, confirmation: "levi_f" })).toEqual({
      ok: true,
    });
    const after = await settle(device.sessionGuard, device.auth, model);
    expect(routeFor(device.auth, after, "app")).toBe("welcome");
    expect(welcomeNotice("account_deleted", after.ended)?.message).toBe(ACCOUNT_DELETED_MESSAGE);
  });

  it("log in → app once the session is confirmed for the new user", async () => {
    const { device, model } = await signedUpDevice();
    await device.logOutFlow.logOut();
    const signedOut = await settle(device.sessionGuard, device.auth, model);
    expect(await device.signInFlow.signIn({ email: signUpForm.email, password: PASSWORD })).toEqual({
      status: "signed_in",
      profile: "ready",
    });
    // Before the check has run for the new user, the welcome screens stay.
    expect(routeFor(device.auth, signedOut, "welcome")).toBe("welcome");
    expect(routeFor(device.auth, await settle(device.sessionGuard, device.auth, signedOut), "welcome")).toBe("app");
  });
});
