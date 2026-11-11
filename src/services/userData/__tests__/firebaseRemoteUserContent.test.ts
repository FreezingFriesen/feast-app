// What the emulator can't show: paging limits, and that reads never come from the cache.
// The real behaviour is proven by the contract suite (npm run test:backend).
import { createFakeConnectivity } from "@/testing/fakes/fakeConnectivity";
import { createFirebaseRemoteUserContent, DELETE_PAGE_SIZE } from "../firebaseRemoteUserContent";

jest.mock("firebase/firestore", () => ({
  collection: jest.fn((_db: unknown, ...path: string[]) => path.join("/")),
  getDocsFromServer: jest.fn(),
  limit: jest.fn((size: number) => ({ size })),
  query: jest.fn((path: string, { size }: { size: number }) => ({ path, size })),
  writeBatch: jest.fn(),
}));

const sdk = jest.requireMock<Record<string, jest.Mock>>("firebase/firestore");

const UID = "Xy3kP9qLmN2vB7cD1eF4gH6jK8l0";
const firestoreError = (code: string) => Object.assign(new Error(code), { code });

// A pretend server holding this many documents in each collection.
function setup({ recipes = 0, mealPlanEntries = 0, online = true, signedInUid = UID as string | null } = {}) {
  jest.clearAllMocks();
  const left: Record<string, number> = { recipes, mealPlanEntries };
  const batchSizes: number[] = [];

  sdk.getDocsFromServer.mockImplementation(async ({ path, size }: { path: string; size: number }) => {
    const name = path.split("/")[2];
    const count = Math.min(left[name], size);
    return { empty: count === 0, docs: Array.from({ length: count }, () => ({ ref: name })) };
  });
  sdk.writeBatch.mockImplementation(() => {
    const refs: string[] = [];
    return {
      delete: (ref: string) => refs.push(ref),
      commit: async () => {
        batchSizes.push(refs.length);
        refs.forEach((name) => {
          left[name] -= 1;
        });
      },
    };
  });

  const content = createFirebaseRemoteUserContent({
    client: { auth: { currentUser: signedInUid ? { uid: signedInUid } : null }, db: {} } as never,
    connectivity: createFakeConnectivity(online).service,
    timeoutMs: 20,
  });
  return { content, left, batchSizes };
}

describe("deleteAll", () => {
  it("deletes both collections in batches of at most 500, until the server says they're empty", async () => {
    const { content, left, batchSizes } = setup({ recipes: 1_200, mealPlanEntries: 30 });
    expect(await content.deleteAll(UID)).toEqual({ ok: true });
    expect(left).toEqual({ recipes: 0, mealPlanEntries: 0 });
    expect(batchSizes).toEqual([500, 500, 200, 30]);
    expect(DELETE_PAGE_SIZE).toBe(500);
    expect(sdk.collection).toHaveBeenCalledWith({}, "users", UID, "recipes");
    expect(sdk.collection).toHaveBeenCalledWith({}, "users", UID, "mealPlanEntries");
  });

  it("succeeds when there's nothing to delete", async () => {
    const { content, batchSizes } = setup();
    expect(await content.deleteAll(UID)).toEqual({ ok: true });
    expect(batchSizes).toEqual([]);
  });

  it.each(["", "../x", "a/b", "'; DROP TABLE recipes;--"])("refuses uid %p before building a path", async (uid) => {
    const { content } = setup();
    expect(await content.deleteAll(uid)).toEqual({ ok: false, reason: "invalid_input" });
    expect(sdk.collection).not.toHaveBeenCalled();
  });

  it.each([["SomeoneElse123"], [null]])("refuses another user's uid when %p is signed in", async (signedInUid) => {
    const { content, left } = setup({ recipes: 3, signedInUid });
    expect(await content.deleteAll(UID)).toEqual({ ok: false, reason: "not_owner" });
    expect(left.recipes).toBe(3);
    expect(sdk.collection).not.toHaveBeenCalled();
  });

  it.each([
    ["permission-denied", "not_owner"],
    ["unavailable", "offline"],
    ["internal", "unknown"],
  ])("a failed read gives a result, not a throw: %s -> %s", async (code, reason) => {
    const { content } = setup({ recipes: 3 });
    sdk.getDocsFromServer.mockRejectedValueOnce(firestoreError(code));
    expect(await content.deleteAll(UID)).toEqual({ ok: false, reason });
  });

  it("reports offline instead of a false success when the device is offline", async () => {
    const { content, left } = setup({ recipes: 3, online: false });
    expect(await content.deleteAll(UID)).toEqual({ ok: false, reason: "offline" });
    expect(left.recipes).toBe(3);
    expect(sdk.getDocsFromServer).not.toHaveBeenCalled();
  });

  it("doesn't hang on a batch Firestore has queued, and a retry finishes", async () => {
    const { content, left } = setup({ recipes: 3 });
    sdk.writeBatch.mockImplementationOnce(() => ({
      delete: () => {},
      commit: () => new Promise<void>(() => {}),
    }));
    expect(await content.deleteAll(UID)).toEqual({ ok: false, reason: "offline" });
    expect(await content.deleteAll(UID)).toEqual({ ok: true });
    expect(left.recipes).toBe(0);
  });
});
