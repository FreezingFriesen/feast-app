import { createInMemoryAuthService } from "@/services/auth/inMemoryAuthService";
import { createInMemoryServer } from "@/services/backend/inMemoryServer";
import { isDomainError } from "@/services/domainErrors";
import { createFakeConnectivity } from "@/testing/fakes/fakeConnectivity";
import { createMemorySecureKeyValue } from "@/testing/fakes/memorySecureKeyValue";
import { createSecureSessionStore } from "../SecureSessionStore";
import { createSessionGuard } from "../sessionGuard";
import { createSessionPolicy } from "../SessionPolicy";

const DAY = 24 * 60 * 60 * 1000;
const LOGIN = Date.UTC(2026, 9, 1, 12, 0);
const CREDENTIALS = { email: "levi@example.com", password: "correct horse battery" };
const AUTH_KEY = "firebase:authUser:key:[DEFAULT]";

async function setup({ signedIn = true, wipeOnExpiry }: { signedIn?: boolean; wipeOnExpiry?: boolean } = {}) {
  let time = LOGIN;
  const now = () => time;
  const server = createInMemoryServer({ connectivity: createFakeConnectivity().service, now });
  const auth = createInMemoryAuthService(server);
  if (signedIn) await auth.signUp(CREDENTIALS);
  const memory = createMemorySecureKeyValue();
  const store = createSecureSessionStore(memory.store);
  const wiper = { wipe: jest.fn(async () => {}) };
  const guard = createSessionGuard({
    auth,
    store,
    policy: createSessionPolicy(now),
    wiper,
    now,
    wipeOnExpiry,
  });
  return {
    auth,
    server,
    store,
    wiper,
    guard,
    items: memory.items,
    setTime: (value: number) => {
      time = value;
    },
  };
}

describe("session guard", () => {
  it("does nothing when nobody is signed in", async () => {
    const { guard, items } = await setup({ signedIn: false });
    expect(await guard.check()).toEqual({ state: "signed_out" });
    expect(items.size).toBe(0);
  });

  it("startSession records the login date from the clock", async () => {
    const { guard, store } = await setup();
    await guard.startSession();
    expect(await store.getLoginAt()).toBe(LOGIN);
  });

  it("keeps an active session and reports when it ends", async () => {
    const { guard, auth, setTime } = await setup();
    await guard.startSession();
    setTime(LOGIN + 29 * DAY);
    expect(await guard.check()).toEqual({ state: "active", expiresAt: LOGIN + 30 * DAY });
    expect(auth.currentUser()).toMatchObject({ email: CREDENTIALS.email });
  });

  it("signs out after 30 days, clears the session but keeps local data", async () => {
    const { guard, auth, store, wiper, setTime } = await setup();
    await guard.startSession();
    await store.authStorage.setItem(AUTH_KEY, "tokens");
    setTime(LOGIN + 30 * DAY);

    expect(await guard.check()).toEqual({ state: "ended", reason: "expired" });
    expect(auth.currentUser()).toBeNull();
    expect(await store.getLoginAt()).toBeNull();
    expect(await store.authStorage.getItem(AUTH_KEY)).toBeNull();
    expect(wiper.wipe).not.toHaveBeenCalled();
  });

  it("wipes local data on expiry only when that decision is switched on", async () => {
    const { guard, wiper, setTime } = await setup({ wipeOnExpiry: true });
    await guard.startSession();
    setTime(LOGIN + 31 * DAY);
    expect(await guard.check()).toEqual({ state: "ended", reason: "expired" });
    expect(wiper.wipe).toHaveBeenCalledTimes(1);
  });

  it("signs out when the clock is set back before the login date", async () => {
    const { guard, auth, setTime } = await setup();
    await guard.startSession();
    setTime(LOGIN - DAY);
    expect(await guard.check()).toEqual({ state: "ended", reason: "clock_before_login" });
    expect(auth.currentUser()).toBeNull();
  });

  it("signs out a session with no login date", async () => {
    const { guard, auth } = await setup();
    expect(await guard.check()).toEqual({ state: "ended", reason: "missing" });
    expect(auth.currentUser()).toBeNull();
  });

  it("signs out a session whose stored login date was tampered with", async () => {
    const { guard, items, auth } = await setup();
    items.set("feast.session.loginAt", "not a date");
    expect(await guard.check()).toEqual({ state: "ended", reason: "missing" });
    expect(auth.currentUser()).toBeNull();
  });

  it("only throws domain errors", async () => {
    const { guard, server, setTime } = await setup();
    await guard.startSession();
    setTime(LOGIN + 31 * DAY);
    server.controls.failNext("auth.signOut");
    const caught = await guard.check().catch((error: unknown) => error);
    expect(isDomainError(caught)).toBe(true);
  });
});
