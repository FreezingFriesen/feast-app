// What the emulator can't show: exactly what is written, and how errors are mapped.
// The real behaviour is proven by the contract suite (npm run test:backend).
import { createFakeConnectivity } from "@/testing/fakes/fakeConnectivity";
import { createFirebaseUsernameRegistry } from "../firebaseUsernameRegistry";

jest.mock("firebase/firestore", () => ({
  deleteDoc: jest.fn(),
  doc: jest.fn((_db: unknown, ...path: string[]) => path.join("/")),
  getDocFromServer: jest.fn(),
  writeBatch: jest.fn(),
}));

const sdk = jest.requireMock<Record<string, jest.Mock>>("firebase/firestore");

const UID = "Xy3kP9qLmN2vB7cD1eF4gH6jK8l0";
const NOW = Date.UTC(2026, 10, 7, 12, 0);
const firestoreError = (code: string) => Object.assign(new Error(`${code} for levi_f`), { code });

function setup({ online = true, signedInUid = UID }: { online?: boolean; signedInUid?: string | null } = {}) {
  jest.clearAllMocks();
  const batch = { set: jest.fn(), commit: jest.fn(async () => {}) };
  sdk.writeBatch.mockReturnValue(batch);
  const registry = createFirebaseUsernameRegistry({
    client: { auth: { currentUser: signedInUid ? { uid: signedInUid } : null }, db: {} } as never,
    connectivity: createFakeConnectivity(online).service,
    now: () => NOW,
    timeoutMs: 20,
  });
  return { registry, batch };
}

describe("isAvailable", () => {
  it("reads the one document from the server, never a list", async () => {
    const { registry } = setup();
    sdk.getDocFromServer.mockResolvedValueOnce({ exists: () => false });
    expect(await registry.isAvailable("Levi_F")).toBe("available");
    expect(sdk.doc).toHaveBeenCalledWith({}, "usernames", "levi_f");
    expect(sdk.getDocFromServer).toHaveBeenCalledTimes(1);

    sdk.getDocFromServer.mockResolvedValueOnce({ exists: () => true });
    expect(await registry.isAvailable("levi_f")).toBe("taken");
  });

  it.each(["ab", "has space", "../x", "'; DROP TABLE recipes;--", 42])("refuses %p without reading", async (name) => {
    const { registry } = setup();
    expect(await registry.isAvailable(name)).toBe("invalid_input");
    expect(sdk.getDocFromServer).not.toHaveBeenCalled();
  });

  it.each([
    ["unavailable", "offline"],
    ["deadline-exceeded", "offline"],
    ["permission-denied", "unknown"],
    ["internal", "unknown"],
  ])("%s -> %s", async (code, expected) => {
    const { registry } = setup();
    sdk.getDocFromServer.mockRejectedValueOnce(firestoreError(code));
    expect(await registry.isAvailable("levi_f")).toBe(expected);
  });

  it("reports offline without reading when the device is offline", async () => {
    const { registry } = setup({ online: false });
    expect(await registry.isAvailable("levi_f")).toBe("offline");
    expect(sdk.getDocFromServer).not.toHaveBeenCalled();
  });
});

describe("claim", () => {
  const expectedProfile = {
    username: "levi_f",
    dietaryRestrictions: null,
    createdAt: NOW,
    updatedAt: NOW,
    schemaVersion: 1,
  };

  it("writes both documents in one batch, with exact fields and whole-number timestamps", async () => {
    const { registry, batch } = setup();
    expect(await registry.claim(UID, "Levi_F")).toEqual({ ok: true, profile: expectedProfile });

    expect(sdk.writeBatch).toHaveBeenCalledTimes(1);
    expect(batch.commit).toHaveBeenCalledTimes(1);
    expect(batch.set.mock.calls).toEqual([
      ["usernames/levi_f", { uid: UID }],
      [`users/${UID}`, expectedProfile],
    ]);
    expect(Number.isInteger(batch.set.mock.calls[1][1].createdAt)).toBe(true);
  });

  it.each([
    ["../x", "levi_f"],
    ["a/b", "levi_f"],
    [UID, "ab"],
    [UID, "'; DROP TABLE recipes;--"],
    [UID, "a/b"],
  ])("refuses uid %p, name %p before building any path", async (uid, name) => {
    const { registry } = setup();
    expect(await registry.claim(uid, name)).toEqual({ ok: false, reason: "invalid_input" });
    expect(sdk.doc).not.toHaveBeenCalled();
  });

  it.each([["SomeoneElse123"], [null]])("refuses when %p is signed in instead", async (signedInUid) => {
    const { registry } = setup({ signedInUid });
    expect(await registry.claim(UID, "levi_f")).toEqual({ ok: false, reason: "not_owner" });
    expect(sdk.writeBatch).not.toHaveBeenCalled();
  });

  it.each([
    ["permission-denied", "taken"],
    ["unavailable", "offline"],
    ["internal", "unknown"],
  ])("%s -> %s", async (code, reason) => {
    const { registry, batch } = setup();
    batch.commit.mockRejectedValueOnce(firestoreError(code));
    expect(await registry.claim(UID, "levi_f")).toEqual({ ok: false, reason });
  });

  it("doesn't hang on a write Firestore has queued", async () => {
    const { registry, batch } = setup();
    batch.commit.mockImplementationOnce(() => new Promise<void>(() => {}));
    expect(await registry.claim(UID, "levi_f")).toEqual({ ok: false, reason: "offline" });
  });

  it("doesn't start a write while offline", async () => {
    const { registry, batch } = setup({ online: false });
    expect(await registry.claim(UID, "levi_f")).toEqual({ ok: false, reason: "offline" });
    expect(batch.commit).not.toHaveBeenCalled();
  });
});

describe("release", () => {
  it("deletes the name's document", async () => {
    const { registry } = setup();
    sdk.deleteDoc.mockResolvedValueOnce(undefined);
    expect(await registry.release(UID, "LEVI_F")).toEqual({ ok: true });
    expect(sdk.deleteDoc).toHaveBeenCalledWith("usernames/levi_f");
  });

  it("treats a refusal as another user owning the name", async () => {
    const { registry } = setup();
    sdk.deleteDoc.mockRejectedValueOnce(firestoreError("permission-denied"));
    expect(await registry.release(UID, "levi_f")).toEqual({ ok: false, reason: "not_owner" });
  });

  it("won't free the signed-in user's name while passing someone else's uid", async () => {
    const { registry } = setup({ signedInUid: "SomeoneElse123" });
    expect(await registry.release(UID, "levi_f")).toEqual({ ok: false, reason: "not_owner" });
    expect(sdk.deleteDoc).not.toHaveBeenCalled();
  });

  it("refuses unsafe input and reports offline", async () => {
    const { registry } = setup();
    expect(await registry.release("a/b", "levi_f")).toEqual({ ok: false, reason: "invalid_input" });
    expect(await registry.release(UID, "a/b")).toEqual({ ok: false, reason: "invalid_input" });
    sdk.deleteDoc.mockRejectedValueOnce(firestoreError("unavailable"));
    expect(await registry.release(UID, "levi_f")).toEqual({ ok: false, reason: "offline" });
  });
});
