import { createFakeConnectivity } from "@/testing/fakes/fakeConnectivity";
import { firestoreCall, FIRESTORE_CALL_TIMEOUT_MS } from "../firestoreCalls";

const online = createFakeConnectivity(true).service;
const offline = createFakeConnectivity(false).service;

describe("firestoreCall", () => {
  it("returns the call's result", async () => {
    expect(await firestoreCall({ connectivity: online }, async () => "done")).toBe("done");
  });

  it("doesn't start the call while offline, and reports offline", async () => {
    const call = jest.fn(async () => "done");
    await expect(firestoreCall({ connectivity: offline }, call)).rejects.toMatchObject({
      name: "DomainError",
      code: "offline",
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("gives up on a call that never finishes, like a queued write", async () => {
    const neverFinishes = () => new Promise<void>(() => {});
    await expect(firestoreCall({ connectivity: online, timeoutMs: 10 }, neverFinishes)).rejects.toMatchObject({
      code: "offline",
    });
  });

  it("uses the default time limit when none is given", async () => {
    jest.useFakeTimers();
    try {
      const result = firestoreCall({ connectivity: online }, () => new Promise<void>(() => {}));
      const caught = result.catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(FIRESTORE_CALL_TIMEOUT_MS);
      expect(await caught).toMatchObject({ code: "offline" });
    } finally {
      jest.useRealTimers();
    }
  });

  it("passes other failures on for the caller to map", async () => {
    const failure = Object.assign(new Error("refused"), { code: "permission-denied" });
    await expect(firestoreCall({ connectivity: online }, () => Promise.reject(failure))).rejects.toBe(failure);
  });
});
