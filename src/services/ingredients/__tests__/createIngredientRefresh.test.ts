import { createInMemoryIngredientRepository } from "@/repositories/inMemoryIngredientRepository";
import type { IngredientRepository } from "@/repositories/IngredientRepository";
import type { AuthUser } from "@/services/auth/AuthService";
import { domainError } from "@/services/domainErrors";
import { createFakeConnectivity } from "@/testing/fakes/fakeConnectivity";
import { makeIngredient, manyIngredients } from "@/testing/ingredientFixtures";
import type { Ingredient } from "@/validation/ingredientSchema";
import {
  createIngredientRefresh,
  INGREDIENT_PAGE_SIZE,
  INGREDIENT_REFRESH_INTERVAL_MS,
  MAX_INGREDIENT_PAGES,
} from "../createIngredientRefresh";
import type { RemoteIngredientDocument, RemoteIngredientPage, RemoteIngredientSource } from "../RemoteIngredientSource";
import { SAMPLE_INGREDIENTS } from "../sampleIngredients";

const NOW = Date.UTC(2026, 10, 20, 12);
const HOUR = 60 * 60 * 1000;
const USER: AuthUser = { uid: "Xy3kP9qLmN2vB7cD1eF4gH6jK8l0", email: null, emailVerified: false };

// A document the way the import stores it: the id is the document's name, not a field.
function toDocument(ingredient: Ingredient): RemoteIngredientDocument {
  const data: Record<string, unknown> = { ...ingredient };
  delete data.id;
  return { id: ingredient.id, data };
}

const ADMIN = makeIngredient("old_copy", "Old copy");

type SourceOptions = {
  // Documents per page (at most the limit asked for).
  pageSize?: number;
  // Fail this page (counting from 1) with this error.
  failAtPage?: number;
  error?: unknown;
};

// A server holding these documents in ID order, paged like Firestore.
function fakeSource(documents: RemoteIngredientDocument[], { pageSize = INGREDIENT_PAGE_SIZE, failAtPage, error }: SourceOptions = {}) {
  const sorted = [...documents].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let page = 0;
  const listPage = jest.fn(async (limit: number, after?: string): Promise<RemoteIngredientPage> => {
    page += 1;
    if (page === failAtPage) throw error;
    const start = after === undefined ? 0 : sorted.findIndex((document) => document.id > after);
    const docs = (start < 0 ? [] : sorted.slice(start)).slice(0, Math.min(pageSize, limit));
    const last = docs.at(-1);
    const more = last !== undefined && sorted.some((document) => document.id > last.id);
    return more ? { docs, next: last.id } : { docs };
  });
  const source: RemoteIngredientSource = { listPage };
  return { source, listPage };
}

function fakeAuth(signedIn = true) {
  let user: AuthUser | null = signedIn ? USER : null;
  const listeners = new Set<(user: AuthUser | null) => void>();
  return {
    service: {
      currentUser: () => user,
      subscribe(listener: (user: AuthUser | null) => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    set(next: AuthUser | null) {
      user = next;
      listeners.forEach((listener) => listener(user));
    },
  };
}

type SetupOptions = {
  documents?: RemoteIngredientDocument[];
  source?: SourceOptions;
  signedIn?: boolean;
  online?: boolean;
  // When the copy already on the phone was downloaded (none if undefined).
  cachedAt?: number;
  repository?: IngredientRepository;
};

async function setup({
  documents = SAMPLE_INGREDIENTS.map(toDocument),
  source: sourceOptions,
  signedIn = true,
  online = true,
  cachedAt,
  repository = createInMemoryIngredientRepository(),
}: SetupOptions = {}) {
  if (cachedAt !== undefined) await repository.replaceAll([ADMIN], cachedAt);
  let time = NOW;
  const { source, listPage } = fakeSource(documents, sourceOptions);
  const auth = fakeAuth(signedIn);
  const connectivity = createFakeConnectivity(online);
  const refresh = createIngredientRefresh({
    auth: auth.service,
    connectivity: connectivity.service,
    source,
    repository,
    now: () => time,
  });
  const ids = async () => (await repository.list()).map((ingredient) => ingredient.id);
  return {
    refresh,
    repository,
    listPage,
    auth,
    connectivity,
    ids,
    setTime: (value: number) => {
      time = value;
    },
  };
}

const SAMPLE_IDS = SAMPLE_INGREDIENTS.map((ingredient) => ingredient.id).sort();

describe("ingredient refresh: when it downloads", () => {
  it("downloads when there is no copy, and saves it with the time of the download", async () => {
    const { refresh, repository, ids } = await setup();
    expect(await refresh.refreshIfDue()).toEqual({ outcome: "updated", valid: SAMPLE_INGREDIENTS.length, skipped: 0 });
    expect(await ids()).toEqual(SAMPLE_IDS);
    expect(await repository.meta()).toEqual({ fetchedAt: NOW, count: SAMPLE_INGREDIENTS.length });
  });

  it("doesn't download while the copy is fresh (up to 24 hours old)", async () => {
    const { refresh, listPage, ids } = await setup({ cachedAt: NOW - INGREDIENT_REFRESH_INTERVAL_MS });
    expect(await refresh.refreshIfDue()).toEqual({ outcome: "fresh", valid: 0, skipped: 0 });
    expect(listPage).not.toHaveBeenCalled();
    expect(await ids()).toEqual(["old_copy"]);
  });

  it("replaces a stale copy", async () => {
    const { refresh, ids } = await setup({ cachedAt: NOW - INGREDIENT_REFRESH_INTERVAL_MS - 1 });
    expect(await refresh.refreshIfDue()).toMatchObject({ outcome: "updated" });
    expect(await ids()).toEqual(SAMPLE_IDS);
  });

  it("treats a copy 'from the future' (the clock was moved back) as stale", async () => {
    const { refresh } = await setup({ cachedAt: NOW + HOUR });
    expect(await refresh.refreshIfDue()).toMatchObject({ outcome: "updated" });
  });

  it("downloads a fresh copy anyway when forced", async () => {
    const { refresh, ids } = await setup({ cachedAt: NOW - HOUR });
    expect(await refresh.refreshIfDue({ force: true })).toMatchObject({ outcome: "updated" });
    expect(await ids()).toEqual(SAMPLE_IDS);
  });

  it("downloads if the copy's details can't be read", async () => {
    const repository = createInMemoryIngredientRepository();
    jest.spyOn(repository, "meta").mockRejectedValue(domainError("storage_failed"));
    const { refresh } = await setup({ repository });
    expect(await refresh.refreshIfDue()).toMatchObject({ outcome: "updated" });
  });
});

describe("ingredient refresh: keeps the copy when it can't download", () => {
  it.each([
    ["offline", { online: false }, "offline"],
    ["signed out", { signedIn: false }, "signed_out"],
  ] as const)("%s: asks the server nothing", async (_label, options, outcome) => {
    const { refresh, listPage, ids } = await setup({ ...options, cachedAt: NOW - 2 * INGREDIENT_REFRESH_INTERVAL_MS });
    expect(await refresh.refreshIfDue({ force: true })).toEqual({ outcome, valid: 0, skipped: 0 });
    expect(listPage).not.toHaveBeenCalled();
    expect(await ids()).toEqual(["old_copy"]);
  });

  it.each([
    ["offline", domainError("offline"), { outcome: "offline" }],
    ["signed out mid-download", domainError("not_owner"), { outcome: "signed_out" }],
    ["a server error", domainError("unknown"), { outcome: "kept_cache", reason: "failed" }],
    ["an error that isn't ours", new Error("boom"), { outcome: "kept_cache", reason: "failed" }],
  ])("a page that fails part way (%s) keeps the old copy", async (_label, error, expected) => {
    const { refresh, listPage, ids } = await setup({ source: { pageSize: 3, failAtPage: 2, error } });
    await refresh.refreshIfDue();
    expect(refresh.lastResult()).toEqual({ ...expected, valid: 3, skipped: 0 });
    expect(listPage).toHaveBeenCalledTimes(2);
    expect(await ids()).toEqual([]);
  });

  it("a failure saving the copy keeps the old one", async () => {
    const repository = createInMemoryIngredientRepository();
    const { refresh, ids } = await setup({ repository, cachedAt: NOW - 2 * INGREDIENT_REFRESH_INTERVAL_MS });
    jest.spyOn(repository, "replaceAll").mockRejectedValueOnce(domainError("storage_failed"));
    expect(await refresh.refreshIfDue()).toEqual({ outcome: "kept_cache", valid: 10, skipped: 0, reason: "failed" });
    expect(await ids()).toEqual(["old_copy"]);
  });
});

describe("ingredient refresh: only a complete, good download replaces the copy", () => {
  // 100 documents, `invalid` of them broken.
  const withInvalid = (invalid: number) =>
    manyIngredients(100).map((ingredient, n) =>
      n < invalid ? { id: ingredient.id, data: { ...toDocument(ingredient).data as object, allergens: ["gluten"] } } : toDocument(ingredient),
    );

  it("uses a download with 10% invalid, and counts what it skipped", async () => {
    const { refresh, ids } = await setup({ documents: withInvalid(10) });
    expect(await refresh.refreshIfDue()).toEqual({ outcome: "updated", valid: 90, skipped: 10 });
    expect(await ids()).toHaveLength(90);
  });

  it("refuses a download with 11% invalid", async () => {
    const { refresh, ids } = await setup({ documents: withInvalid(11), cachedAt: NOW - 2 * INGREDIENT_REFRESH_INTERVAL_MS });
    expect(await refresh.refreshIfDue()).toEqual({ outcome: "kept_cache", valid: 89, skipped: 11, reason: "too_many_invalid" });
    expect(await ids()).toEqual(["old_copy"]);
  });

  it.each([
    ["nothing valid", withInvalid(100), 100],
    ["an empty collection", [], 0],
  ])("refuses %s, so a good copy is never wiped", async (_label, documents, skipped) => {
    const { refresh, ids } = await setup({ documents, cachedAt: NOW - 2 * INGREDIENT_REFRESH_INTERVAL_MS });
    expect(await refresh.refreshIfDue()).toEqual({ outcome: "kept_cache", valid: 0, skipped, reason: "none_valid" });
    expect(await ids()).toEqual(["old_copy"]);
  });

  it("takes 2,000 ingredients, the most it keeps", async () => {
    const { refresh, listPage } = await setup({ documents: manyIngredients(2000).map(toDocument) });
    expect(await refresh.refreshIfDue()).toEqual({ outcome: "updated", valid: 2000, skipped: 0 });
    expect(listPage).toHaveBeenCalledTimes(4);
  });

  it("stops past 2,000 documents and keeps the copy", async () => {
    const { refresh, listPage, ids } = await setup({ documents: manyIngredients(2001).map(toDocument) });
    expect(await refresh.refreshIfDue()).toEqual({ outcome: "kept_cache", valid: 2001, skipped: 0, reason: "too_many" });
    expect(listPage).toHaveBeenCalledTimes(5);
    expect(await ids()).toEqual([]);
  });

  it(`stops after ${MAX_INGREDIENT_PAGES} pages that never reach the end`, async () => {
    const { refresh, listPage, ids } = await setup({ documents: manyIngredients(50).map(toDocument), source: { pageSize: 2 } });
    expect(await refresh.refreshIfDue()).toEqual({ outcome: "kept_cache", valid: 20, skipped: 0, reason: "incomplete" });
    expect(listPage).toHaveBeenCalledTimes(MAX_INGREDIENT_PAGES);
    expect(await ids()).toEqual([]);
  });

  it.each([
    ["doesn't move forward", { docs: [toDocument(makeIngredient("b_item", "B"))], next: "a_item" }],
    ["isn't an ID", { docs: [toDocument(makeIngredient("b_item", "B"))], next: "../x" }],
  ])("stops when the second page's cursor %s", async (_label, secondPage) => {
    const listPage = jest
      .fn()
      .mockResolvedValueOnce({ docs: [toDocument(makeIngredient("a_item", "A"))], next: "a_item" })
      .mockResolvedValueOnce(secondPage);
    const refresh = createIngredientRefresh({
      auth: fakeAuth().service,
      connectivity: createFakeConnectivity().service,
      source: { listPage },
      repository: createInMemoryIngredientRepository(),
      now: () => NOW,
    });
    expect(await refresh.refreshIfDue()).toEqual({ outcome: "kept_cache", valid: 2, skipped: 0, reason: "failed" });
  });
});

describe("ingredient refresh: every document is checked", () => {
  const FLOUR = SAMPLE_INGREDIENTS[0];

  it.each([
    ["an ID that isn't safe in a path", { id: "../x", data: toDocument(FLOUR).data }],
    ["the bad ID from Edwin's v5 file", { id: "roll_dinner_+A148+A140", data: toDocument(FLOUR).data }],
    ["fields that aren't an object", { id: "flour_two", data: ["not", "an", "object"] }],
    ["no fields", { id: "flour_two", data: null }],
    ["a document that isn't an object", "flour"],
    ["an attack name", { id: "flour_two", data: { ...(toDocument(FLOUR).data as object), name: "<script>alert(1)</script>" } }],
    ["a duplicate ID", toDocument({ ...FLOUR, name: "Flour again" })],
  ])("skips %s", async (_label, bad) => {
    const documents = [...SAMPLE_INGREDIENTS.map(toDocument), bad as RemoteIngredientDocument];
    const listPage = jest.fn(async () => ({ docs: documents }));
    const repository = createInMemoryIngredientRepository();
    const refresh = createIngredientRefresh({
      auth: fakeAuth().service,
      connectivity: createFakeConnectivity().service,
      source: { listPage },
      repository,
      now: () => NOW,
    });
    expect(await refresh.refreshIfDue()).toEqual({ outcome: "updated", valid: 10, skipped: 1 });
    expect(await repository.list()).toEqual([...SAMPLE_INGREDIENTS].sort((a, b) => (a.id < b.id ? -1 : 1)));
  });

  it("uses the document's name as the ID, whatever its fields say", async () => {
    const { refresh, ids } = await setup({
      documents: [{ id: "all_purpose_flour", data: { ...(toDocument(SAMPLE_INGREDIENTS[0]).data as object), id: "admin" } }],
    });
    expect(await refresh.refreshIfDue()).toMatchObject({ outcome: "updated", valid: 1 });
    expect(await ids()).toEqual(["all_purpose_flour"]);
  });

  it("drops unknown fields, and accepts a price collected 'tomorrow' by a phone whose clock is behind", async () => {
    const tomorrow = new Date(Date.now() + 24 * HOUR).toISOString().slice(0, 10);
    const flour = { ...(toDocument(SAMPLE_INGREDIENTS[0]).data as object), priceCollectedAt: tomorrow, isAdmin: true };
    const { refresh, repository } = await setup({ documents: [{ id: "all_purpose_flour", data: flour }] });
    expect(await refresh.refreshIfDue()).toMatchObject({ outcome: "updated", valid: 1 });
    const [saved] = await repository.list();
    expect(saved.priceCollectedAt).toBe(tomorrow);
    expect(saved).not.toHaveProperty("isAdmin");
  });
});

describe("ingredient refresh: one at a time", () => {
  it("two refreshes at once share one download", async () => {
    const { refresh, listPage } = await setup();
    const [first, second] = await Promise.all([refresh.refreshIfDue(), refresh.refreshIfDue()]);
    expect(first).toBe(second);
    expect(listPage).toHaveBeenCalledTimes(1);
  });

  it("a forced refresh during one that finds the copy fresh still downloads", async () => {
    const { refresh, listPage } = await setup({ cachedAt: NOW - HOUR });
    const [automatic, forced] = await Promise.all([refresh.refreshIfDue(), refresh.refreshIfDue({ force: true })]);
    expect(automatic.outcome).toBe("fresh");
    expect(forced.outcome).toBe("updated");
    expect(listPage).toHaveBeenCalledTimes(1);
  });

  it("a forced refresh during one that downloads shares it", async () => {
    const { refresh, listPage } = await setup();
    const [automatic, forced] = await Promise.all([refresh.refreshIfDue(), refresh.refreshIfDue({ force: true })]);
    expect(automatic.outcome).toBe("updated");
    expect(forced).toEqual(automatic);
    expect(listPage).toHaveBeenCalledTimes(1);
  });

  it("an automatic refresh during a forced one shares it", async () => {
    const { refresh, listPage } = await setup({ cachedAt: NOW - HOUR });
    const [forced, automatic] = await Promise.all([refresh.refreshIfDue({ force: true }), refresh.refreshIfDue()]);
    expect(forced).toBe(automatic);
    expect(listPage).toHaveBeenCalledTimes(1);
  });

  it("starts a new run once the last one has finished", async () => {
    const { refresh, listPage } = await setup();
    await refresh.refreshIfDue({ force: true });
    await refresh.refreshIfDue({ force: true });
    expect(listPage).toHaveBeenCalledTimes(2);
  });
});

describe("ingredient refresh: start", () => {
  // Lets every run that was started finish (the fakes answer straight away).
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("refreshes straight away when due", async () => {
    const { refresh, listPage } = await setup();
    const stop = refresh.start();
    await settle();
    expect(listPage).toHaveBeenCalledTimes(1);
    stop();
  });

  it("refreshes on sign in", async () => {
    const { refresh, listPage, auth } = await setup({ signedIn: false });
    const stop = refresh.start();
    await settle();
    expect(refresh.lastResult()?.outcome).toBe("signed_out");
    auth.set(USER);
    await settle();
    expect(listPage).toHaveBeenCalledTimes(1);
    expect(refresh.lastResult()?.outcome).toBe("updated");
    stop();
  });

  it("a sign in during a signed-out run still downloads", async () => {
    const { refresh, listPage, auth } = await setup({ signedIn: false });
    // The user signs in just after the first run checked and found nobody, while that run
    // is still finishing.
    const currentUser = auth.service.currentUser;
    let checks = 0;
    auth.service.currentUser = () => {
      checks += 1;
      if (checks === 1) queueMicrotask(() => auth.set(USER));
      return currentUser();
    };
    const stop = refresh.start();
    await settle();
    expect(listPage).toHaveBeenCalledTimes(1);
    expect(refresh.lastResult()?.outcome).toBe("updated");
    stop();
  });

  it("refreshes when the connection comes back, if the copy is due", async () => {
    const { refresh, listPage, connectivity, setTime } = await setup({ online: false });
    const stop = refresh.start();
    await settle();
    expect(refresh.lastResult()?.outcome).toBe("offline");
    connectivity.setOnline(true);
    await settle();
    expect(listPage).toHaveBeenCalledTimes(1);

    // Still fresh: coming back online again downloads nothing.
    connectivity.setOnline(false);
    connectivity.setOnline(true);
    await settle();
    expect(listPage).toHaveBeenCalledTimes(1);

    // A day later it does.
    setTime(NOW + INGREDIENT_REFRESH_INTERVAL_MS + 1);
    connectivity.setOnline(false);
    connectivity.setOnline(true);
    await settle();
    expect(listPage).toHaveBeenCalledTimes(2);
    stop();
  });

  it("signing out or going offline starts nothing, and stop() stops listening", async () => {
    const { refresh, listPage, auth, connectivity, setTime } = await setup({ cachedAt: NOW - 2 * INGREDIENT_REFRESH_INTERVAL_MS });
    const stop = refresh.start();
    await settle();
    expect(listPage).toHaveBeenCalledTimes(1);
    // A day later the copy is due again, but these start nothing.
    setTime(NOW + INGREDIENT_REFRESH_INTERVAL_MS + 1);
    auth.set(null);
    connectivity.setOnline(false);
    await settle();
    expect(listPage).toHaveBeenCalledTimes(1);

    stop();
    auth.set(USER);
    connectivity.setOnline(true);
    await settle();
    expect(listPage).toHaveBeenCalledTimes(1);
  });

  it("remembers the last result", async () => {
    const { refresh } = await setup();
    expect(refresh.lastResult()).toBeNull();
    await refresh.refreshIfDue();
    expect(refresh.lastResult()).toMatchObject({ outcome: "updated" });
  });
});
