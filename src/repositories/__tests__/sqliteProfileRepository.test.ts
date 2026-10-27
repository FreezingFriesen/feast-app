import { runMigrations } from "@/storage/migrations";
import {
  CONTRACT_UID,
  describeProfileRepositoryContract,
  INCOMING_PROFILE,
} from "@/testing/contracts/profileRepositoryContract";
import { createNodeSqliteDatabase } from "@/testing/nodeSqliteDatabase";
import { createSqliteProfileRepository } from "../sqliteProfileRepository";

async function setup(now: () => number = Date.now) {
  const db = createNodeSqliteDatabase();
  await runMigrations(db);
  return { db, repo: createSqliteProfileRepository(db, now) };
}

const tableExists = (db: ReturnType<typeof createNodeSqliteDatabase>) =>
  db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'profiles'").get() !== undefined;

describeProfileRepositoryContract("SQLite", async (now) => (await setup(now)).repo);

describe("SQLite profile repository", () => {
  it.each([
    "'; DROP TABLE profiles;--",
    "x'); DROP TABLE profiles;--",
    "<script>alert(1)</script>",
    "1 OR 1=1",
  ])("treats %p as data: nothing runs and the table still exists", async (attack) => {
    const { db, repo } = await setup();
    await repo.mergeIncoming(CONTRACT_UID, INCOMING_PROFILE);

    await repo.get(attack);
    await repo.mergeIncoming(attack, INCOMING_PROFILE);
    await repo.setDietaryRestrictions(attack, { allergens: [], diets: [] });
    await repo.setDietaryRestrictions(CONTRACT_UID, { allergens: [attack], diets: [] });
    await repo.mergeIncoming(CONTRACT_UID, { ...INCOMING_PROFILE, username: attack, updatedAt: Date.now() });

    expect(tableExists(db)).toBe(true);
    expect(await repo.get(CONTRACT_UID)).toEqual({ ...INCOMING_PROFILE, uid: CONTRACT_UID });
    expect(db.raw.prepare("SELECT COUNT(*) AS count FROM profiles").get()).toEqual({ count: 1 });
  });

  it("stores the restrictions as JSON and 'not set yet' as NULL", async () => {
    const { db, repo } = await setup();
    await repo.mergeIncoming(CONTRACT_UID, INCOMING_PROFILE);
    const column = () =>
      (db.raw.prepare("SELECT dietary_restrictions AS value FROM profiles").get() as { value: string | null }).value;
    expect(column()).toBeNull();
    await repo.setDietaryRestrictions(CONTRACT_UID, { allergens: ["sesame"], diets: [] });
    expect(JSON.parse(column() as string)).toEqual({ allergens: ["sesame"], diets: [] });
  });

  it.each([
    ["bad JSON", "UPDATE profiles SET dietary_restrictions = '{not json'"],
    ["an unknown allergen", `UPDATE profiles SET dietary_restrictions = '{"allergens":["gluten"],"diets":[]}'`],
    ["very long JSON", `UPDATE profiles SET dietary_restrictions = '${"x".repeat(5_000)}'`],
    ["an invalid username", "UPDATE profiles SET username = 'Levi F'"],
    ["a bad timestamp", "UPDATE profiles SET updated_at = -1"],
    ["a text timestamp", "UPDATE profiles SET created_at = 'yesterday'"],
  ])("reads a row with %s as missing", async (_label, tamper) => {
    const { db, repo } = await setup();
    await repo.mergeIncoming(CONTRACT_UID, INCOMING_PROFILE);
    db.raw.exec(tamper);
    expect(await repo.get(CONTRACT_UID)).toBeUndefined();
  });
});

describe("migrations", () => {
  it("creates the schema once and can run again on every start", async () => {
    const db = createNodeSqliteDatabase();
    await runMigrations(db);
    await runMigrations(db);
    expect(tableExists(db)).toBe(true);
    expect(db.raw.prepare("PRAGMA user_version").get()).toEqual({ user_version: 1 });
  });
});
