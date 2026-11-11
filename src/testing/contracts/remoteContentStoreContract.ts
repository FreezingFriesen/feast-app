// Shared behaviour for every RemoteContentStore. Runs against the in-memory backend
// (npm test) and the real Security Rules on the Firebase emulators (npm run test:backend),
// so the in-memory store can't drift from what Firestore accepts.
import type { RemoteContentStore } from "@/services/userData/RemoteContentStore";
import { entryDocument, recipeDocument } from "../syncFixtures";

export type RemoteContentHarness = {
  // A newly signed-up user, signed in, with their own store.
  signedInUser(): Promise<{ uid: string; store: RemoteContentStore }>;
};

const MINUTE = 60 * 1000;

export function describeRemoteContentStoreContract(name: string, harness: RemoteContentHarness) {
  // Timestamps a little in the past, so they are valid against the server's clock.
  const base = () => Date.now() - 10 * MINUTE;

  describe(`RemoteContentStore contract: ${name}`, () => {
    it("writes documents and reads them back exactly, oldest updatedAt first", async () => {
      const { uid, store } = await harness.signedInUser();
      const t = base();
      const documents = [
        { id: "recipe-b", data: recipeDocument(t + 2, { description: "Fluffy" }) },
        { id: "recipe-a", data: recipeDocument(t + 1) },
      ];
      const results = await store.upsertMany(uid, "recipes", documents);
      expect(results).toEqual([
        { id: "recipe-b", result: { ok: true } },
        { id: "recipe-a", result: { ok: true } },
      ]);
      expect(await store.fetchChanges(uid, "recipes", { since: 0, pageSize: 500 })).toEqual({
        ok: true,
        documents: [
          { id: "recipe-a", data: documents[1].data },
          { id: "recipe-b", data: documents[0].data },
        ],
        next: null,
      });
      expect(await store.count(uid, "recipes")).toEqual({ ok: true, count: 2 });
      expect(await store.count(uid, "mealPlanEntries")).toEqual({ ok: true, count: 0 });
    });

    it("pages with a cursor, even through documents that share an updatedAt", async () => {
      const { uid, store } = await harness.signedInUser();
      const t = base();
      const ids = ["e1", "e2", "e3", "e4", "e5"];
      await store.upsertMany(uid, "mealPlanEntries", ids.map((id) => ({ id, data: entryDocument(t) })));

      const seen: string[] = [];
      let after: { updatedAt: number; id: string } | undefined;
      for (let page = 0; page < 5; page += 1) {
        const result = await store.fetchChanges(uid, "mealPlanEntries", { since: t, after, pageSize: 2 });
        if (!result.ok) throw new Error(result.reason);
        seen.push(...result.documents.map((document) => document.id));
        if (!result.next) break;
        after = result.next;
      }
      expect(seen).toEqual(ids);
    });

    it("returns only documents with updatedAt at or after `since`", async () => {
      const { uid, store } = await harness.signedInUser();
      const t = base();
      await store.upsertMany(uid, "recipes", [
        { id: "old", data: recipeDocument(t) },
        { id: "same", data: recipeDocument(t + 5) },
        { id: "new", data: recipeDocument(t + 9) },
      ]);
      const result = await store.fetchChanges(uid, "recipes", { since: t + 5, pageSize: 500 });
      expect(result.ok && result.documents.map((document) => document.id)).toEqual(["same", "new"]);
    });

    it("refuses the writes the Security Rules refuse, record by record", async () => {
      const { uid, store } = await harness.signedInUser();
      const t = base();
      await store.upsert(uid, "recipes", "kept", recipeDocument(t + 10));
      await store.upsert(uid, "recipes", "deleted", recipeDocument(t + 10, { deletedAt: t + 10 }));
      await store.upsert(uid, "mealPlanEntries", "entry", entryDocument(t + 10));
      const { mealTypes: _dropped, ...missingKey } = recipeDocument(t);

      const results = await store.upsertMany(uid, "recipes", [
        { id: "good", data: recipeDocument(t) },
        { id: "kept", data: recipeDocument(t + 5) }, // older than the server's copy
        { id: "deleted", data: recipeDocument(t + 20) }, // would bring a deleted recipe back
        { id: "moved-created", data: recipeDocument(t) },
        { id: "future", data: recipeDocument(Date.now() + 24 * 60 * MINUTE) },
        { id: "extra-key", data: { ...recipeDocument(t), id: "extra-key" } },
        { id: "missing-key", data: missingKey },
      ]);
      expect(results.map(({ id, result }) => [id, result.ok])).toEqual([
        ["good", true],
        ["kept", false],
        ["deleted", false],
        ["moved-created", true],
        ["future", false],
        ["extra-key", false],
        ["missing-key", false],
      ]);
      expect(results.filter(({ result }) => !result.ok).every(({ result }) => !result.ok && result.reason === "rejected")).toBe(
        true,
      );
      // createdAt can't change, and an entry's recipe can't change.
      expect(await store.upsert(uid, "recipes", "moved-created", recipeDocument(t + 30, { createdAt: t + 1 }))).toEqual({
        ok: false,
        reason: "rejected",
      });
      expect(
        await store.upsert(uid, "mealPlanEntries", "entry", entryDocument(t + 30, { createdAt: t + 10, recipeId: "other" })),
      ).toEqual({ ok: false, reason: "rejected" });
      // A newer copy and a newer deleted copy are accepted.
      expect(await store.upsert(uid, "recipes", "kept", recipeDocument(t + 30, { createdAt: t + 10 }))).toEqual({ ok: true });
      expect(
        await store.upsert(uid, "recipes", "deleted", recipeDocument(t + 30, { createdAt: t + 10, deletedAt: t + 10 })),
      ).toEqual({ ok: true });
    });

    it("refuses another user's documents and unsafe input before building a path", async () => {
      const owner = await harness.signedInUser();
      const other = await harness.signedInUser();
      const t = base();
      expect(await other.store.upsert(owner.uid, "recipes", "r1", recipeDocument(t))).toEqual({
        ok: false,
        reason: "not_owner",
      });
      expect(await other.store.fetchChanges(owner.uid, "recipes", { since: 0, pageSize: 10 })).toEqual({
        ok: false,
        reason: "not_owner",
      });
      expect(await other.store.count(owner.uid, "recipes")).toEqual({ ok: false });

      const { uid, store } = owner;
      expect(await store.upsert("a/b", "recipes", "r1", recipeDocument(t))).toEqual({ ok: false, reason: "invalid_input" });
      expect(await store.upsert(uid, "recipesBackup" as never, "r1", recipeDocument(t))).toEqual({
        ok: false,
        reason: "invalid_input",
      });
      for (const id of ["../x", "a/b", "ABC", "", "'; DROP TABLE recipes;--"]) {
        expect(await store.upsert(uid, "recipes", id, recipeDocument(t))).toEqual({ ok: false, reason: "invalid_input" });
      }
      expect(await store.fetchChanges(uid, "recipes", { since: 0, pageSize: 501 })).toEqual({
        ok: false,
        reason: "invalid_input",
      });
      expect(
        await store.fetchChanges(uid, "recipes", { since: 0, after: { updatedAt: t, id: "../x" }, pageSize: 10 }),
      ).toEqual({ ok: false, reason: "invalid_input" });
      const tooMany = Array.from({ length: 101 }, (_, index) => ({ id: `r${index}`, data: recipeDocument(t) }));
      expect((await store.upsertMany(uid, "recipes", tooMany)).every(({ result }) => !result.ok)).toBe(true);
      expect(await store.count(uid, "recipes")).toEqual({ ok: true, count: 0 });
    });
  });
}
