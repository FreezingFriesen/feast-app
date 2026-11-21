// What the emulator can't show: a call that never finishes, error codes it won't produce,
// and that nothing is sent when signed out or offline. The real behaviour is proven by the
// contract suite on the emulators (npm run test:backend).
import { createFakeConnectivity } from "@/testing/fakes/fakeConnectivity";
import { createFirebaseRemoteIngredientSource } from "../firebaseRemoteIngredientSource";

jest.mock("firebase/firestore", () => ({
  collection: jest.fn((_db: unknown, path: string) => path),
  documentId: jest.fn(() => "__name__"),
  getDocsFromServer: jest.fn(),
  limit: jest.fn((size: number) => ({ limit: size })),
  orderBy: jest.fn((field: string) => ({ orderBy: field })),
  query: jest.fn((path: string, ...constraints: unknown[]) => ({ path, constraints })),
  startAfter: jest.fn((id: string) => ({ startAfter: id })),
}));

const sdk = jest.requireMock<Record<string, jest.Mock>>("firebase/firestore");
const firestoreError = (code: string) => Object.assign(new Error(code), { code });
const documents = (...ids: string[]) => ({ docs: ids.map((id) => ({ id, data: () => ({ name: id }) })) });

function setup({ online = true, signedIn = true } = {}) {
  jest.clearAllMocks();
  return createFirebaseRemoteIngredientSource({
    client: { auth: { currentUser: signedIn ? { uid: "Xy3kP9qLmN2vB7cD1eF4gH6jK8l0" } : null }, db: {} } as never,
    connectivity: createFakeConnectivity(online).service,
    timeoutMs: 20,
  });
}

describe("Firebase ingredient source", () => {
  it("reads the ingredients collection from the server, ordered by ID, after the cursor", async () => {
    const source = setup();
    sdk.getDocsFromServer.mockResolvedValueOnce(documents("a", "b"));
    expect(await source.listPage(2, "flour")).toEqual({
      docs: [
        { id: "a", data: { name: "a" } },
        { id: "b", data: { name: "b" } },
      ],
      next: "b",
    });
    expect(sdk.query).toHaveBeenCalledWith("ingredients", { orderBy: "__name__" }, { startAfter: "flour" }, { limit: 2 });
  });

  it("has no cursor after a short page, and none to start from", async () => {
    const source = setup();
    sdk.getDocsFromServer.mockResolvedValueOnce(documents("a"));
    expect(await source.listPage(2)).toEqual({ docs: [{ id: "a", data: { name: "a" } }] });
    expect(sdk.query).toHaveBeenCalledWith("ingredients", { orderBy: "__name__" }, { limit: 2 });
  });

  it.each([
    ["permission-denied", "not_owner"],
    ["unavailable", "offline"],
    ["deadline-exceeded", "offline"],
    ["internal", "unknown"],
  ])("turns Firestore's %p into %p", async (firebaseCode, expected) => {
    const source = setup();
    sdk.getDocsFromServer.mockRejectedValueOnce(firestoreError(firebaseCode));
    await expect(source.listPage(10)).rejects.toMatchObject({ name: "DomainError", code: expected });
  });

  it("gives up on a read that never finishes, as offline", async () => {
    const source = setup();
    sdk.getDocsFromServer.mockImplementationOnce(() => new Promise<never>(() => {}));
    await expect(source.listPage(10)).rejects.toMatchObject({ code: "offline" });
  });

  it.each([
    ["signed out", { signedIn: false }, "not_owner"],
    ["offline", { online: false }, "offline"],
  ])("sends nothing when %s", async (_label, options, expected) => {
    const source = setup(options);
    await expect(source.listPage(10)).rejects.toMatchObject({ code: expected });
    expect(sdk.getDocsFromServer).not.toHaveBeenCalled();
  });

  it("checks its arguments before building a query", async () => {
    const source = setup();
    await expect(source.listPage(501)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(source.listPage(10, "../x")).rejects.toMatchObject({ code: "invalid_input" });
    expect(sdk.query).not.toHaveBeenCalled();
  });
});
