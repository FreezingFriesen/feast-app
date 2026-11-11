import { createTestDevice, createTestServer } from "@/testing/accountTestBed";
import { createLogOutFlow } from "../logOutFlow";

const form = {
  email: "levi@example.com",
  username: "levi_f",
  password: "correct horse battery",
  confirmPassword: "correct horse battery",
};

async function signedInDevice(options?: { wipeOnLogout?: boolean }) {
  const { server, connectivity } = createTestServer();
  const device = createTestDevice(server, options);
  await device.signUpFlow.signUp(form);
  return { connectivity, device, uid: device.auth.currentUser()!.uid };
}

describe("log out flow", () => {
  it("signs out, clears the session and wipes local data (default decision)", async () => {
    const { device, uid } = await signedInDevice();
    expect(device.logOutFlow.wipesLocalData).toBe(true);
    expect(await device.logOutFlow.logOut()).toEqual({ ok: true });
    expect(device.auth.currentUser()).toBeNull();
    expect(device.secure.items.size).toBe(0);
    expect(await device.profiles.get(uid)).toBeUndefined();
  });

  it("keeps local data when that decision is switched off", async () => {
    const { device, uid } = await signedInDevice({ wipeOnLogout: false });
    expect(device.logOutFlow.wipesLocalData).toBe(false);
    await device.logOutFlow.logOut();
    expect(await device.profiles.get(uid)).toMatchObject({ username: "levi_f" });
  });

  it("works offline", async () => {
    const { connectivity, device } = await signedInDevice();
    connectivity.setOnline(false);
    expect(await device.logOutFlow.logOut()).toEqual({ ok: true });
    expect(device.auth.currentUser()).toBeNull();
  });

  it("syncs first when asked, then logs out", async () => {
    const { device } = await signedInDevice();
    device.sync.setStatus({ pendingChanges: 3 });
    expect(await device.logOutFlow.logOut({ syncFirst: true })).toEqual({ ok: true });
    expect(device.sync.service.getStatus().pendingChanges).toBe(0);
    expect(device.auth.currentUser()).toBeNull();
  });

  it.each([
    ["changes are still pending", () => ({ state: "idle" as const, pendingChanges: 2 })],
    ["the sync failed", () => ({ state: "error" as const, pendingChanges: 0 })],
  ])("stays logged in and keeps the data when %s", async (_label, outcome) => {
    const { device, uid } = await signedInDevice();
    device.sync.setStatus({ pendingChanges: 2 });
    device.sync.onSync((current) => ({ ...current, ...outcome() }));

    expect(await device.logOutFlow.logOut({ syncFirst: true })).toEqual({ ok: false, error: "sync_failed" });
    expect(device.auth.currentUser()).not.toBeNull();
    expect(await device.profiles.get(uid)).toBeDefined();
    expect(await device.sessionGuard.check()).toMatchObject({ state: "active" });
  });

  it("stays logged in when syncing throws", async () => {
    const { device } = await signedInDevice();
    device.sync.onSync(() => {
      throw new Error("network");
    });
    expect(await device.logOutFlow.logOut({ syncFirst: true })).toEqual({ ok: false, error: "sync_failed" });
    expect(device.auth.currentUser()).not.toBeNull();
  });

  it("still signs out when wiping fails, and reports it", async () => {
    const { device } = await signedInDevice();
    jest.spyOn(device.profiles, "clear").mockRejectedValue(new Error("disk full"));
    expect(await device.logOutFlow.logOut()).toEqual({ ok: false, error: "storage_failed" });
    expect(device.auth.currentUser()).toBeNull();
  });

  it("stops sync while still signed in, before anything is removed", async () => {
    const { device, uid } = await signedInDevice();
    let atStop: { signedIn: boolean; hasProfile: boolean } | undefined;
    device.sync.service.stop = async () => {
      atStop = { signedIn: device.auth.currentUser() !== null, hasProfile: (await device.profiles.get(uid)) !== undefined };
    };
    expect(await device.logOutFlow.logOut()).toEqual({ ok: true });
    expect(atStop).toEqual({ signedIn: true, hasProfile: true });
  });
});

describe("before the log out prompt", () => {
  // The flow as useAccountFlows builds it, with a short time limit for the sync.
  async function deviceWithFlow() {
    const { device, uid } = await signedInDevice();
    const flow = createLogOutFlow({
      auth: device.auth,
      sessionGuard: device.sessionGuard,
      localData: device.localData,
      sync: device.sync.service,
      prepareTimeoutMs: 20,
    });
    return { device, uid, flow };
  }

  it("syncs what it can and returns how many changes still aren't backed up", async () => {
    const { device, flow } = await deviceWithFlow();
    device.sync.setStatus({ pendingChanges: 3 });
    device.sync.onSync((current) => ({ ...current, pendingChanges: 1 }));
    expect(await flow.prepare()).toEqual({ pendingChanges: 1 });
    expect(device.sync.calls).toEqual(["syncNow"]);
  });

  it("doesn't wait longer than the time limit for a slow sync", async () => {
    const { device, flow } = await deviceWithFlow();
    device.sync.setStatus({ pendingChanges: 2 });
    device.sync.onSync(() => new Promise(() => {}));
    expect(await flow.prepare()).toEqual({ pendingChanges: 2 });
  });

  it("carries on when the sync fails, and logging out still wipes the phone", async () => {
    const { device, uid, flow } = await deviceWithFlow();
    device.sync.setStatus({ pendingChanges: 2 });
    device.sync.onSync(() => {
      throw new Error("network");
    });
    expect(await flow.prepare()).toEqual({ pendingChanges: 2 });
    expect(await flow.logOut()).toEqual({ ok: true });
    expect(device.auth.currentUser()).toBeNull();
    expect(await device.profiles.get(uid)).toBeUndefined();
  });
});
