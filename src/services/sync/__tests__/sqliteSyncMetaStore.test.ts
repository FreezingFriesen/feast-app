import { runMigrations } from "@/storage/migrations";
import { createNodeSqliteDatabase } from "@/testing/nodeSqliteDatabase";
import { createSqliteSyncMetaStore } from "../sqliteSyncMetaStore";

const UID = "Xy3kP9qLmN2vB7cD1eF4gH6jK8l0";
const T = Date.UTC(2026, 9, 1);
const EMPTY = { ownerUid: null, highWater: { recipes: null, mealPlanEntries: null }, lastSyncedAt: null };

async function setup() {
  const db = createNodeSqliteDatabase();
  await runMigrations(db);
  return { db, meta: createSqliteSyncMetaStore(db) };
}

describe("SQLite sync metadata", () => {
  it("starts empty, remembers each value, and clear forgets them all", async () => {
    const { meta } = await setup();
    expect(await meta.read()).toEqual(EMPTY);

    await meta.setOwner(UID);
    await meta.setHighWater("recipes", T + 1);
    await meta.setHighWater("mealPlanEntries", T + 2);
    await meta.setLastSyncedAt(T + 3);
    await meta.setHighWater("recipes", T + 4);
    expect(await meta.read()).toEqual({
      ownerUid: UID,
      highWater: { recipes: T + 4, mealPlanEntries: T + 2 },
      lastSyncedAt: T + 3,
    });

    await meta.clear();
    expect(await meta.read()).toEqual(EMPTY);
  });

  it.each([
    ["an unsafe uid", () => ({ owner: "a/b" })],
    ["a uid with SQL in it", () => ({ owner: "'; DROP TABLE sync_meta;--" })],
    ["a timestamp that isn't whole", () => ({ highWater: T + 0.5 })],
    ["a timestamp before 2020", () => ({ highWater: 1_000 })],
    ["a timestamp that isn't a number", () => ({ highWater: "soon" as unknown as number })],
  ])("ignores %s instead of storing it", async (_label, value) => {
    const { db, meta } = await setup();
    const { owner, highWater } = value() as { owner?: string; highWater?: number };
    if (owner !== undefined) await meta.setOwner(owner);
    if (highWater !== undefined) await meta.setHighWater("recipes", highWater);
    expect(await meta.read()).toEqual(EMPTY);
    expect(db.raw.prepare("SELECT COUNT(*) AS count FROM sync_meta").get()).toEqual({ count: 0 });
  });

  it.each([
    ["owner_uid", "Not a uid!", "ownerUid"],
    ["owner_uid", "x".repeat(500), "ownerUid"],
    ["recipes_high_water", "12abc", "recipes"],
    ["meal_plan_entries_high_water", "-5", "mealPlanEntries"],
    ["last_synced_at", "99999999999999999999", "lastSyncedAt"],
  ])("reads a tampered %s (%p) as missing", async (key, value) => {
    const { db, meta } = await setup();
    db.raw.prepare("INSERT INTO sync_meta (key, value) VALUES (?, ?)").run(key, value);
    expect(await meta.read()).toEqual(EMPTY);
  });

  it("ignores keys it doesn't know", async () => {
    const { db, meta } = await setup();
    db.raw.prepare("INSERT INTO sync_meta (key, value) VALUES (?, ?)").run("is_admin", "1");
    expect(await meta.read()).toEqual(EMPTY);
  });
});
