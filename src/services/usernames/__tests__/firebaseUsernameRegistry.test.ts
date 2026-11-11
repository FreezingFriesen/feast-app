// What the emulator can't show: exactly what is written, and how errors are mapped.
// The real behaviour is proven by the contract suite (npm run test:backend).
import { createFakeConnectivity } from "@/testing/fakes/fakeConnectivity";
import { createFirebaseUsernameRegistry } from "../firebaseUsernameRegistry";

jest.mock("firebase/firestore", () => ({
  deleteDoc: jest.fn(),
  doc: jest.fn((_db: unknown, ...path: string[]) => path.join("/")),
  getDocFromServer: jest.fn(),
  runTransaction: jest.fn(),
}));

const sdk = jest.requireMock<Record<string, jest.Mock>>("firebase/firestore");

const UID = "Xy3kP9qLmN2vB7cD1eF4gH6jK8l0";
const OTHER_UID = "SomeoneElse123";
const NOW = Date.UTC(2026, 10, 7, 12, 0);
const firestoreError = (code: string) => Object.assign(new Error(`${code} for levi_f`), { code });
const missing = { exists: () => false, get: () => undefined };
const ownedBy = (uid: string) => ({ exists: () => true, get: (field: string) => (field === "uid" ? uid : undefined) });

// runTransaction against a pretend server holding the `existing` paths. The writes the
// transaction makes are recorded.
function setup({ online = true, signedInUid = UID as string | null, existing = [] as string[] } = {}) {
  jest.clearAllMocks();
  const writes: [string, unknown][] = [];
  const transaction = {
    get: jest.fn(async (path: string) => ({ exists: () => existing.includes(path) })),
    set: jest.fn((path: string, data: unknown) => writes.push([path, data])),
  };
  sdk.runTransaction.mockImplementation((_db, update: (t: typeof transaction) => Promise<unknown>) =>
    update(transaction),
  );
  const registry = createFirebaseUsernameRegistry({
    client: { auth: { currentUser: signedInUid ? { uid: signedInUid } : null }, db: {} } as never,
    connectivity: createFakeConnectivity(online).service,
    now: () => NOW,
    timeoutMs: 20,
  });
  return { registry, transaction, writes };
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

  it("reads both documents, then writes both in one transaction, with exact fields", async () => {
    const { registry, transaction, writes } = setup();
    expect(await registry.claim(UID, "Levi_F")).toEqual({ ok: true, profile: expectedProfile });

    expect(sdk.runTransaction).toHaveBeenCalledTimes(1);
    expect(transaction.get.mock.calls).toEqual([["usernames/levi_f"], [`users/${UID}`]]);
    expect(writes).toEqual([
      ["usernames/levi_f", { uid: UID }],
      [`users/${UID}`, expectedProfile],
    ]);
    expect(Number.isInteger((writes[1][1] as { createdAt: unknown }).createdAt)).toBe(true);
  });

  it("reports a name someone already holds as taken, and writes nothing", async () => {
    const { registry, writes } = setup({ existing: ["usernames/levi_f"] });
    expect(await registry.claim(UID, "levi_f")).toEqual({ ok: false, reason: "taken" });
    expect(writes).toEqual([]);
  });

  it("refuses a second username for a user who already has one, and writes nothing", async () => {
    const { registry, writes } = setup({ existing: [`users/${UID}`] });
    expect(await registry.claim(UID, "levi_f")).toEqual({ ok: false, reason: "taken" });
    expect(writes).toEqual([]);
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
    expect(sdk.runTransaction).not.toHaveBeenCalled();
  });

  it.each([[OTHER_UID], [null]])("refuses when %p is signed in instead", async (signedInUid) => {
    const { registry } = setup({ signedInUid });
    expect(await registry.claim(UID, "levi_f")).toEqual({ ok: false, reason: "not_owner" });
    expect(sdk.runTransaction).not.toHaveBeenCalled();
  });

  describe("when the Security Rules refuse the commit", () => {
    it("reports taken if another user got the name first (a race)", async () => {
      const { registry } = setup();
      sdk.runTransaction.mockRejectedValueOnce(firestoreError("permission-denied"));
      sdk.getDocFromServer.mockResolvedValueOnce(ownedBy(OTHER_UID));
      expect(await registry.claim(UID, "levi_f")).toEqual({ ok: false, reason: "taken" });
      expect(sdk.getDocFromServer).toHaveBeenCalledWith("usernames/levi_f");
    });

    it.each([
      ["the name is still free (e.g. a phone clock too far ahead)", missing],
      ["the name is this user's", ownedBy(UID)],
    ])("reports unknown, not taken, if %s", async (_case, snapshot) => {
      const { registry } = setup();
      sdk.runTransaction.mockRejectedValueOnce(firestoreError("permission-denied"));
      sdk.getDocFromServer.mockResolvedValueOnce(snapshot);
      expect(await registry.claim(UID, "levi_f")).toEqual({ ok: false, reason: "unknown" });
    });

    it.each([
      ["unavailable", "offline"],
      ["permission-denied", "unknown"],
      ["internal", "unknown"],
    ])("maps a failed re-read: %s -> %s", async (code, reason) => {
      const { registry } = setup();
      sdk.runTransaction.mockRejectedValueOnce(firestoreError("permission-denied"));
      sdk.getDocFromServer.mockRejectedValueOnce(firestoreError(code));
      expect(await registry.claim(UID, "levi_f")).toEqual({ ok: false, reason });
    });
  });

  it.each([
    ["unavailable", "offline"],
    ["deadline-exceeded", "offline"],
    ["aborted", "unknown"],
    ["internal", "unknown"],
  ])("%s -> %s, without a re-read", async (code, reason) => {
    const { registry } = setup();
    sdk.runTransaction.mockRejectedValueOnce(firestoreError(code));
    expect(await registry.claim(UID, "levi_f")).toEqual({ ok: false, reason });
    expect(sdk.getDocFromServer).not.toHaveBeenCalled();
  });

  it("doesn't hang on a transaction that never finishes", async () => {
    const { registry } = setup();
    sdk.runTransaction.mockImplementationOnce(() => new Promise<never>(() => {}));
    expect(await registry.claim(UID, "levi_f")).toEqual({ ok: false, reason: "offline" });
  });

  it("doesn't start a transaction while offline", async () => {
    const { registry } = setup({ online: false });
    expect(await registry.claim(UID, "levi_f")).toEqual({ ok: false, reason: "offline" });
    expect(sdk.runTransaction).not.toHaveBeenCalled();
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
    const { registry } = setup({ signedInUid: OTHER_UID });
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
