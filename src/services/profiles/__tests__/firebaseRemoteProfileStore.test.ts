// What the emulator can't show: tampered documents and error mapping.
// The real behaviour is proven by the contract suite (npm run test:backend).
import { createFakeConnectivity } from "@/testing/fakes/fakeConnectivity";
import { createFirebaseRemoteProfileStore } from "../firebaseRemoteProfileStore";

jest.mock("firebase/firestore", () => ({
  deleteDoc: jest.fn(),
  doc: jest.fn((_db: unknown, ...path: string[]) => path.join("/")),
  getDocFromServer: jest.fn(),
}));

const sdk = jest.requireMock<Record<string, jest.Mock>>("firebase/firestore");

const UID = "Xy3kP9qLmN2vB7cD1eF4gH6jK8l0";
const T0 = Date.UTC(2026, 9, 1);
const STORED = { username: "levi_f", dietaryRestrictions: null, createdAt: T0, updatedAt: T0, schemaVersion: 1 };
const firestoreError = (code: string) => Object.assign(new Error(code), { code });
const found = (data: unknown) => ({ exists: () => true, data: () => data });

function setup(online = true) {
  jest.clearAllMocks();
  return createFirebaseRemoteProfileStore({
    client: { db: {} } as never,
    connectivity: createFakeConnectivity(online).service,
    timeoutMs: 20,
  });
}

describe("fetch", () => {
  it("returns the parsed profile, not the raw document", async () => {
    const store = setup();
    sdk.getDocFromServer.mockResolvedValueOnce(found({ ...STORED, isAdmin: true, email: "levi@example.com" }));
    expect(await store.fetch(UID)).toEqual({ ok: true, profile: STORED });
    expect(sdk.doc).toHaveBeenCalledWith({}, "users", UID);
  });

  it("returns null when there's no document", async () => {
    const store = setup();
    sdk.getDocFromServer.mockResolvedValueOnce({ exists: () => false });
    expect(await store.fetch(UID)).toEqual({ ok: true, profile: null });
  });

  it.each([
    { username: "Levi F" },
    { username: "<script>alert(1)</script>" },
    { dietaryRestrictions: { allergens: ["gluten"], diets: [] } },
    { createdAt: "yesterday" },
    { updatedAt: T0 - 1 },
    { schemaVersion: 2 },
  ])("reports a document with %j as unknown", async (patch) => {
    const store = setup();
    sdk.getDocFromServer.mockResolvedValueOnce(found({ ...STORED, ...patch }));
    expect(await store.fetch(UID)).toEqual({ ok: false, reason: "unknown" });
  });

  it.each([
    ["permission-denied", "not_owner"],
    ["unavailable", "offline"],
    ["internal", "unknown"],
  ])("%s -> %s", async (code, reason) => {
    const store = setup();
    sdk.getDocFromServer.mockRejectedValueOnce(firestoreError(code));
    expect(await store.fetch(UID)).toEqual({ ok: false, reason });
  });

  it.each(["", "../x", "a/b", "'; DROP TABLE recipes;--"])("refuses uid %p before building a path", async (uid) => {
    const store = setup();
    expect(await store.fetch(uid)).toEqual({ ok: false, reason: "invalid_input" });
    expect(sdk.doc).not.toHaveBeenCalled();
  });

  it("reports offline without reading", async () => {
    const store = setup(false);
    expect(await store.fetch(UID)).toEqual({ ok: false, reason: "offline" });
    expect(sdk.getDocFromServer).not.toHaveBeenCalled();
  });
});

describe("delete", () => {
  it("deletes the document", async () => {
    const store = setup();
    sdk.deleteDoc.mockResolvedValueOnce(undefined);
    expect(await store.delete(UID)).toEqual({ ok: true });
    expect(sdk.deleteDoc).toHaveBeenCalledWith(`users/${UID}`);
  });

  it.each([
    ["permission-denied", "not_owner"],
    ["unavailable", "offline"],
    ["internal", "unknown"],
  ])("returns a result instead of throwing: %s -> %s", async (code, reason) => {
    const store = setup();
    sdk.deleteDoc.mockRejectedValueOnce(firestoreError(code));
    expect(await store.delete(UID)).toEqual({ ok: false, reason });
  });

  it("doesn't hang on a delete Firestore has queued", async () => {
    const store = setup();
    sdk.deleteDoc.mockImplementationOnce(() => new Promise<void>(() => {}));
    expect(await store.delete(UID)).toEqual({ ok: false, reason: "offline" });
  });

  it("refuses an unsafe uid", async () => {
    const store = setup();
    expect(await store.delete("../x")).toEqual({ ok: false, reason: "invalid_input" });
    expect(sdk.deleteDoc).not.toHaveBeenCalled();
  });
});
