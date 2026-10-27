import { runMigrations } from "@/storage/migrations";
import { createFakeConnectivity } from "@/testing/fakes/fakeConnectivity";
import { createMemorySecureKeyValue } from "@/testing/fakes/memorySecureKeyValue";
import { createNodeSqliteDatabase } from "@/testing/nodeSqliteDatabase";
import type { Backend } from "@/validation/configSchema";
import { createAppServices, resolveBackend } from "../createAppServices";

describe("resolveBackend", () => {
  it.each([
    [undefined, true, "memory"],
    ["memory", true, "memory"],
    ["firebase", true, "firebase"],
    ["firebase", false, "firebase"],
  ])("%p in dev=%p -> %p", (raw, isDev, expected) => {
    expect(resolveBackend(raw, isDev)).toBe(expected);
  });

  it.each([
    [undefined, false], // unset in a production build means memory, which is refused
    ["memory", false],
    ["Memory", true],
    ["sqlite", true],
    ["", true],
    ["memory ", true],
  ])("refuses %p in dev=%p", (raw, isDev) => {
    expect(() => resolveBackend(raw, isDev)).toThrow(
      expect.objectContaining({ name: "DomainError", code: "backend_not_configured" }),
    );
  });
});

async function setup(backend: Backend) {
  const database = createNodeSqliteDatabase();
  await runMigrations(database);
  const secure = createMemorySecureKeyValue();
  const app = createAppServices({
    backend,
    database,
    secure: secure.store,
    connectivity: createFakeConnectivity().service,
  });
  return { ...app, secureItems: secure.items };
}

describe("createAppServices with the in-memory backend", () => {
  it("wires sign up, username claim, the SQLite profile, the session and the wipe together", async () => {
    const { services, repositories, devControls, secureItems } = await setup("memory");
    expect(devControls).not.toBeNull();

    const signUp = await services.auth.signUp({ email: "levi@example.com", password: "correct horse battery" });
    if (!signUp.ok) throw new Error(signUp.error);
    const claim = await services.usernames.claim(signUp.user.uid, "Levi_F");
    if (!claim.ok) throw new Error(claim.reason);
    expect(await repositories.profiles.mergeIncoming(signUp.user.uid, claim.profile)).toBe("applied");
    expect(await repositories.profiles.get(signUp.user.uid)).toMatchObject({ username: "levi_f" });

    await services.sessionGuard.startSession();
    expect(await services.sessionGuard.check()).toMatchObject({ state: "active" });
    expect(secureItems.has("feast.session.loginAt")).toBe(true);

    await services.localData.wipe();
    expect(await repositories.profiles.get(signUp.user.uid)).toBeUndefined();
  });

  it("starts with the stub sync status", async () => {
    const { services } = await setup("memory");
    expect(services.sync.getStatus()).toMatchObject({ state: "unavailable", pendingChanges: 0 });
  });
});

describe("createAppServices with the firebase backend (not configured yet)", () => {
  it("fails loudly on the remote side but keeps local data working", async () => {
    const { services, repositories, devControls } = await setup("firebase");
    expect(devControls).toBeNull();
    await expect(services.auth.whenReady()).rejects.toMatchObject({ code: "backend_not_configured" });
    await expect(services.usernames.isAvailable("levi_f")).rejects.toMatchObject({ code: "backend_not_configured" });
    expect(await repositories.recipes.list()).toEqual([]);
  });
});
