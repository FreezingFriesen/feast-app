import { createInMemoryAuthService } from "@/services/auth/inMemoryAuthService";
import { createInMemoryServer } from "@/services/backend/inMemoryServer";
import { describeRemoteContentStoreContract } from "@/testing/contracts/remoteContentStoreContract";
import { createFakeConnectivity } from "@/testing/fakes/fakeConnectivity";
import { recipeDocument } from "@/testing/syncFixtures";
import { createInMemoryRemoteContentStore } from "../inMemoryRemoteContentStore";

let counter = 0;

// Each user gets their own server, because the in-memory server has one signed-in user.
async function signedInUser() {
  const server = createInMemoryServer({ connectivity: createFakeConnectivity(true).service });
  const auth = createInMemoryAuthService(server);
  const result = await auth.signUp({ email: `user${++counter}@example.com`, password: "correct horse battery" });
  if (!result.ok) throw new Error(result.error);
  return { uid: result.user.uid, store: createInMemoryRemoteContentStore(server), server };
}

describeRemoteContentStoreContract("in-memory", { signedInUser });

describe("in-memory RemoteContentStore", () => {
  const t = Date.UTC(2026, 9, 1);

  it("reports offline for reads, writes and counts", async () => {
    const { uid, store, server } = await signedInUser();
    server.controls.setOffline(true);
    expect(await store.fetchChanges(uid, "recipes", { since: 0, pageSize: 10 })).toEqual({ ok: false, reason: "offline" });
    expect(await store.upsertMany(uid, "recipes", [{ id: "r1", data: recipeDocument(t) }])).toEqual([
      { id: "r1", result: { ok: false, reason: "offline" } },
    ]);
    expect(await store.count(uid, "recipes")).toEqual({ ok: false });
  });

  it("keeps its own copy, like data that crossed a network", async () => {
    const { uid, store } = await signedInUser();
    const data = recipeDocument(t);
    await store.upsert(uid, "recipes", "r1", data);
    (data.steps as string[]).push("Changed after upload");
    const result = await store.fetchChanges(uid, "recipes", { since: 0, pageSize: 10 });
    if (!result.ok) throw new Error(result.reason);
    expect((result.documents[0].data as { steps: string[] }).steps).toEqual(["Mix", "Cook"]);
    (result.documents[0].data as { steps: string[] }).steps.push("Changed after download");
    const again = await store.fetchChanges(uid, "recipes", { since: 0, pageSize: 10 });
    expect(again.ok && (again.documents[0].data as { steps: string[] }).steps).toEqual(["Mix", "Cook"]);
  });

  it("skips documents whose updatedAt isn't a number, as Firestore's range filter does", async () => {
    const { uid, store, server } = await signedInUser();
    server.state.userContent.set(uid, new Map([["recipes/odd", { ...recipeDocument(t), updatedAt: "soon" }]]));
    expect(await store.fetchChanges(uid, "recipes", { since: 0, pageSize: 10 })).toEqual({
      ok: true,
      documents: [],
      next: null,
    });
  });
});
