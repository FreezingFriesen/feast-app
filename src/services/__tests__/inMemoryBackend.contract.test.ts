import { createInMemoryAuthService } from "@/services/auth/inMemoryAuthService";
import { createInMemoryServer, MAX_FAILED_SIGN_INS, RATE_LIMIT_WINDOW_MS } from "@/services/backend/inMemoryServer";
import { createInMemoryRemoteProfileStore } from "@/services/profiles/inMemoryRemoteProfileStore";
import { createInMemoryRemoteUserContent } from "@/services/userData/inMemoryRemoteUserContent";
import { createInMemoryUsernameRegistry } from "@/services/usernames/inMemoryUsernameRegistry";
import {
  describeAuthServiceContract,
  describeRemoteProfileStoreContract,
  describeRemoteUserContentContract,
  describeUsernameRegistryContract,
  type BackendHarness,
} from "@/testing/contracts/backendContract";
import { createFakeConnectivity } from "@/testing/fakes/fakeConnectivity";

let counter = 0;

function createBackend(latencyMs = 0) {
  const connectivity = createFakeConnectivity(true);
  const server = createInMemoryServer({ connectivity: connectivity.service, latencyMs });
  return {
    server,
    connectivity,
    auth: createInMemoryAuthService(server),
    usernames: createInMemoryUsernameRegistry(server),
    remoteProfiles: createInMemoryRemoteProfileStore(server),
    remoteContent: createInMemoryRemoteUserContent(server),
  };
}

const harness: BackendHarness = {
  supportsControls: true,
  async create() {
    const { auth, usernames, remoteProfiles, remoteContent, server } = createBackend();
    return { auth, usernames, remoteProfiles, remoteContent, controls: server.controls };
  },
  uniqueEmail: () => `user${++counter}@example.com`,
  uniqueUsername: () => `user_${++counter}`,
};

describeAuthServiceContract("in-memory", harness);
describeUsernameRegistryContract("in-memory", harness);
describeRemoteProfileStoreContract("in-memory", harness);
describeRemoteUserContentContract("in-memory", harness);

describe("in-memory backend", () => {
  const credentials = { email: "levi@example.com", password: "correct horse battery" };

  it("simulates latency on server calls", async () => {
    const { usernames } = createBackend(40);
    const started = Date.now();
    await usernames.isAvailable("levi_f");
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
  });

  it("is offline when the device is offline, without the switch", async () => {
    const { auth, connectivity } = createBackend();
    connectivity.setOnline(false);
    expect(await auth.signUp(credentials)).toEqual({ ok: false, error: "offline" });
    connectivity.setOnline(true);
    expect(await auth.signUp(credentials)).toMatchObject({ ok: true });
  });

  it(`rate-limits after ${MAX_FAILED_SIGN_INS} failed sign-ins until the window passes`, async () => {
    const { auth, server } = createBackend();
    await auth.signUp(credentials);
    await auth.signOut();
    for (let i = 0; i < MAX_FAILED_SIGN_INS; i += 1) {
      expect(await auth.signIn({ ...credentials, password: "wrong password" })).toEqual({
        ok: false,
        error: "invalid_credentials",
      });
    }
    // Even the right password is refused while rate-limited.
    expect(await auth.signIn(credentials)).toEqual({ ok: false, error: "rate_limited" });
    server.controls.advanceClock(RATE_LIMIT_WINDOW_MS);
    expect(await auth.signIn(credentials)).toMatchObject({ ok: true });
  });

  it("injects a failure the requested number of times", async () => {
    const { usernames, server } = createBackend();
    server.controls.failNext("usernames.isAvailable", "offline", 2);
    expect(await usernames.isAvailable("levi_f")).toBe("offline");
    expect(await usernames.isAvailable("levi_f")).toBe("offline");
    expect(await usernames.isAvailable("levi_f")).toBe("available");

    server.controls.failNext("usernames.isAvailable", "offline", 5);
    server.controls.clearFailures();
    expect(await usernames.isAvailable("levi_f")).toBe("available");
  });

  it("turns injected codes a method doesn't use into unknown", async () => {
    const { auth, server } = createBackend();
    server.controls.failNext("auth.signUp", "storage_failed");
    expect(await auth.signUp(credentials)).toEqual({ ok: false, error: "unknown" });
  });

  it("updates the user when the email is verified", async () => {
    const { auth, server } = createBackend();
    await auth.signUp(credentials);
    const before = auth.currentUser();
    const listener = jest.fn();
    auth.subscribe(listener);

    server.controls.markEmailVerified(before!.uid);
    expect(auth.currentUser()).toMatchObject({ emailVerified: true });
    expect(auth.currentUser()).not.toBe(before);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("deleting the auth user leaves the username and profile for AccountDeleter", async () => {
    const { auth, usernames, server } = createBackend();
    const result = await auth.signUp(credentials);
    if (!result.ok) throw new Error(result.error);
    await usernames.claim(result.user.uid, "levi_f");
    await auth.deleteAuthUser();
    expect(server.state.usernames.get("levi_f")).toBe(result.user.uid);
    expect(server.state.users.has(result.user.uid)).toBe(true);
  });
});
