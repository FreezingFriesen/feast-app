// Shared behaviour for every MealPlanRepository (in-memory and SQLite).
import type { MealPlanEntry, MealPlanRepository, MealPlanWriteResult } from "@/repositories/MealPlanRepository";
import { MAX_PENDING_BATCH } from "@/repositories/Syncable";
import { MAX_ENTRIES_PER_SLOT } from "@/validation/mealPlanSchema";
import { ID_PATTERN } from "@/validation/patterns";

export const T0 = Date.UTC(2026, 9, 1);

export const ENTRY_INPUT = { date: "2026-10-19", mealType: "dinner", recipeId: "recipe-1", servings: 4 } as const;

// An entry as another device uploaded it (a sync download). The ID is the document ID.
export const INCOMING_ID = "remote-entry-1";
export const INCOMING_ENTRY = { ...ENTRY_INPUT, createdAt: T0, updatedAt: T0, schemaVersion: 1 };

export function expectOk(result: MealPlanWriteResult): MealPlanEntry {
  if (!result.ok) throw new Error(`Expected ok, got ${result.reason}`);
  return result.entry;
}

// An entry without its ID: the shape listPending returns as `data`.
const dataOf = ({ id: _id, ...data }: MealPlanEntry) => data;

export function describeMealPlanRepositoryContract(
  name: string,
  create: (now: () => number) => Promise<MealPlanRepository>,
) {
  // A clock the test controls, so updatedAt values are predictable.
  async function setup() {
    let time = T0 + 1_000;
    const repo = await create(() => time);
    return {
      repo,
      setTime: (value: number) => {
        time = value;
      },
      tick: (ms = 1) => {
        time += ms;
      },
    };
  }

  // An entry that was downloaded (so it isn't pending), at updatedAt T0.
  async function setupWithIncoming() {
    const context = await setup();
    expect(await context.repo.mergeIncoming(INCOMING_ID, INCOMING_ENTRY)).toBe("applied");
    return context;
  }

  const everything = (repo: MealPlanRepository) => repo.listBetween("2000-01-01", "2100-12-31");

  // Fills the input's slot to the limit.
  async function fillSlot(repo: MealPlanRepository) {
    const entries: MealPlanEntry[] = [];
    for (let i = 0; i < MAX_ENTRIES_PER_SLOT; i += 1) {
      entries.push(expectOk(await repo.add(ENTRY_INPUT)));
    }
    return entries;
  }

  describe(`MealPlanRepository contract: ${name}`, () => {
    describe("add", () => {
      it("stores a valid entry with timestamps and a safe ID, and marks it pending", async () => {
        const { repo } = await setup();
        const entry = expectOk(await repo.add(ENTRY_INPUT));
        expect(entry).toEqual({
          ...ENTRY_INPUT,
          id: entry.id,
          createdAt: T0 + 1_000,
          updatedAt: T0 + 1_000,
          schemaVersion: 1,
        });
        expect(entry.id).toMatch(ID_PATTERN);
        expect(await repo.getById(entry.id)).toEqual(entry);
        expect(await repo.listPending(10)).toEqual([{ id: entry.id, data: dataOf(entry) }]);
        expect(await repo.pendingCount()).toBe(1);
      });

      it("stores the parsed data, not the raw input", async () => {
        const { repo } = await setup();
        const entry = expectOk(await repo.add({ ...ENTRY_INPUT, extra: "x", id: "chosen-id", deletedAt: 5 }));
        expect(entry).not.toHaveProperty("extra");
        expect(entry.id).not.toBe("chosen-id");
        expect(entry.deletedAt).toBeUndefined();
        const [pending] = await repo.listPending(10);
        expect(JSON.parse(JSON.stringify(pending.data))).toStrictEqual(pending.data);
      });

      it.each([
        { recipeId: "'; DROP TABLE recipes;--" },
        { recipeId: "<script>alert(1)</script>" },
        { recipeId: "../other-user" },
        { recipeId: "a".repeat(10_000) },
        { date: "2026-02-30" },
        { date: "'; DROP TABLE meal_plan_entries;--" },
        { mealType: "snack" },
        { servings: 0 },
        { servings: 101 },
      ])("rejects %p and writes nothing", async (patch) => {
        const { repo } = await setup();
        expect(await repo.add({ ...ENTRY_INPUT, ...patch })).toMatchObject({ ok: false, reason: "invalid" });
        expect(await everything(repo)).toEqual([]);
        expect(await repo.pendingCount()).toBe(0);
      });

      it("refuses to save with a clock outside the timestamp range", async () => {
        const { repo, setTime } = await setup();
        setTime(1_000);
        expect(await repo.add(ENTRY_INPUT)).toMatchObject({ ok: false, reason: "invalid" });
        expect(await everything(repo)).toEqual([]);
      });
    });

    describe("slot limit", () => {
      it(`allows ${MAX_ENTRIES_PER_SLOT} entries per slot`, async () => {
        const { repo } = await setup();
        await fillSlot(repo);
        expect(await repo.add(ENTRY_INPUT)).toEqual({ ok: false, reason: "slot_full" });
        // Other slots are unaffected.
        expectOk(await repo.add({ ...ENTRY_INPUT, mealType: "lunch" }));
        expect(await repo.pendingCount()).toBe(MAX_ENTRIES_PER_SLOT + 1);
      });

      it("lets only the limit through when many adds run at once", async () => {
        const { repo } = await setup();
        const results = await Promise.all(Array.from({ length: 15 }, () => repo.add(ENTRY_INPUT)));
        expect(results.filter((result) => result.ok)).toHaveLength(MAX_ENTRIES_PER_SLOT);
        expect(results.filter((result) => !result.ok)).toEqual(Array(5).fill({ ok: false, reason: "slot_full" }));
        expect(await everything(repo)).toHaveLength(MAX_ENTRIES_PER_SLOT);
      });

      it("will not move an entry into a full slot, but can edit inside a full slot", async () => {
        const { repo } = await setup();
        const inFullSlot = await fillSlot(repo);
        const lunch = expectOk(await repo.add({ ...ENTRY_INPUT, mealType: "lunch" }));
        expect(await repo.update(lunch.id, { mealType: "dinner" })).toEqual({ ok: false, reason: "slot_full" });
        expect(await repo.getById(lunch.id)).toEqual(lunch);
        expectOk(await repo.update(inFullSlot[0].id, { servings: 2 }));
      });

      it("a removed entry frees its slot", async () => {
        const { repo } = await setup();
        const entries = await fillSlot(repo);
        await repo.remove(entries[0].id);
        expectOk(await repo.add(ENTRY_INPUT));
      });

      it("downloads ignore the limit; entries in an over-full slot can still be edited, but nothing more moves in", async () => {
        const { repo } = await setup();
        await fillSlot(repo);
        expect(await repo.mergeIncoming(INCOMING_ID, INCOMING_ENTRY)).toBe("applied");
        expect(await everything(repo)).toHaveLength(MAX_ENTRIES_PER_SLOT + 1);

        expect(await repo.add(ENTRY_INPUT)).toEqual({ ok: false, reason: "slot_full" });
        expectOk(await repo.update(INCOMING_ID, { servings: 6 }));
        const lunch = expectOk(await repo.add({ ...ENTRY_INPUT, mealType: "lunch" }));
        expect(await repo.update(lunch.id, { mealType: "dinner" })).toEqual({ ok: false, reason: "slot_full" });
      });
    });

    describe("update", () => {
      it("moves an entry and changes servings, bumping updatedAt and marking it pending", async () => {
        const { repo, tick } = await setupWithIncoming();
        tick(500);
        const updated = expectOk(
          await repo.update(INCOMING_ID, { date: "2026-10-20", mealType: "lunch", servings: 2 }),
        );
        expect(updated).toEqual({
          ...INCOMING_ENTRY,
          id: INCOMING_ID,
          date: "2026-10-20",
          mealType: "lunch",
          servings: 2,
          updatedAt: T0 + 1_500,
        });
        expect(await repo.getById(INCOMING_ID)).toEqual(updated);
        expect(await repo.listPending(10)).toEqual([{ id: INCOMING_ID, data: dataOf(updated) }]);
      });

      it("keeps fields that are not in the patch", async () => {
        const { repo } = await setup();
        const entry = expectOk(await repo.add(ENTRY_INPUT));
        const updated = expectOk(await repo.update(entry.id, { servings: 6 }));
        expect(updated).toMatchObject({ date: ENTRY_INPUT.date, mealType: ENTRY_INPUT.mealType, servings: 6 });
      });

      it("cannot change the recipe, createdAt or schemaVersion", async () => {
        const { repo } = await setup();
        const entry = expectOk(await repo.add(ENTRY_INPUT));
        const updated = expectOk(
          await repo.update(entry.id, { recipeId: "recipe-2", createdAt: T0 + 9, schemaVersion: 9, servings: 3 }),
        );
        expect(updated).toMatchObject({ recipeId: "recipe-1", createdAt: entry.createdAt, schemaVersion: 1 });
      });

      it("never moves updatedAt backwards when the clock goes back", async () => {
        const { repo, setTime } = await setupWithIncoming();
        setTime(T0 - 60_000);
        const updated = expectOk(await repo.update(INCOMING_ID, { servings: 9 }));
        expect(updated.updatedAt).toBe(T0 + 1);
        // So the copy it replaced can't undo the edit
        expect(await repo.mergeIncoming(INCOMING_ID, INCOMING_ENTRY)).toBe("kept_local");
        expect((await repo.getById(INCOMING_ID))?.servings).toBe(9);
      });

      it("rejects an invalid patch and leaves the entry unchanged", async () => {
        const { repo } = await setupWithIncoming();
        const before = await repo.getById(INCOMING_ID);
        expect(await repo.update(INCOMING_ID, { servings: 101 })).toMatchObject({ reason: "invalid" });
        expect(await repo.update(INCOMING_ID, { date: "<script>alert(1)</script>" })).toMatchObject({
          reason: "invalid",
        });
        expect(await repo.update(INCOMING_ID, { mealType: "'; DROP TABLE meal_plan_entries;--" })).toMatchObject({
          reason: "invalid",
        });
        expect(await repo.getById(INCOMING_ID)).toEqual(before);
        expect(await repo.pendingCount()).toBe(0);
      });

      it("returns not_found for unknown, unsafe and removed IDs", async () => {
        const { repo } = await setupWithIncoming();
        await repo.remove(INCOMING_ID);
        for (const id of ["missing", "../x", "", INCOMING_ID]) {
          expect(await repo.update(id, { servings: 2 })).toEqual({ ok: false, reason: "not_found" });
        }
      });
    });

    describe("remove (soft delete)", () => {
      it("hides the entry from every read, keeps it removed, and uploads it as a tombstone", async () => {
        const { repo, setTime } = await setupWithIncoming();
        setTime(T0 + 7_000);
        expect(await repo.remove(INCOMING_ID)).toBe(true);

        expect(await repo.getById(INCOMING_ID)).toBeUndefined();
        expect(await everything(repo)).toEqual([]);
        expect(await repo.update(INCOMING_ID, { servings: 2 })).toEqual({ ok: false, reason: "not_found" });
        expect(await repo.remove(INCOMING_ID)).toBe(false);
        expect(await repo.listPending(10)).toEqual([
          { id: INCOMING_ID, data: { ...INCOMING_ENTRY, updatedAt: T0 + 7_000, deletedAt: T0 + 7_000 } },
        ]);
      });

      it("never moves updatedAt backwards when the clock goes back", async () => {
        const { repo, setTime } = await setupWithIncoming();
        setTime(T0 - 60_000);
        await repo.remove(INCOMING_ID);
        const [tombstone] = await repo.listPending(10);
        expect(tombstone.data).toMatchObject({ updatedAt: T0 + 1, deletedAt: T0 + 1 });
      });

      it("returns false for unknown or unsafe IDs", async () => {
        const { repo } = await setup();
        for (const id of ["missing", "", "a/b", "'; DROP TABLE meal_plan_entries;--"]) {
          expect(await repo.remove(id)).toBe(false);
        }
      });
    });

    describe("listBetween", () => {
      it("includes both end dates and sorts oldest first", async () => {
        const { repo, tick } = await setup();
        for (const date of ["2026-10-26", "2026-10-25", "2026-10-18", "2026-10-19"]) {
          expectOk(await repo.add({ ...ENTRY_INPUT, date }));
          tick();
        }
        const dates = (await repo.listBetween("2026-10-19", "2026-10-25")).map((entry) => entry.date);
        expect(dates).toEqual(["2026-10-25", "2026-10-19"]);
      });

      it("keeps the order they were added when createdAt is the same", async () => {
        const { repo } = await setup();
        for (const servings of [1, 2, 3]) {
          expectOk(await repo.add({ ...ENTRY_INPUT, servings }));
        }
        expect((await everything(repo)).map((entry) => entry.servings)).toEqual([1, 2, 3]);
      });

      it("returns nothing for an invalid range", async () => {
        const { repo } = await setup();
        expectOk(await repo.add(ENTRY_INPUT));
        expect(await repo.listBetween("'; DROP TABLE recipes;--", "2100-12-31")).toEqual([]);
        expect(await repo.listBetween("2000-01-01", "")).toEqual([]);
        expect(await repo.listBetween("2026-02-30", "2100-12-31")).toEqual([]);
      });
    });

    describe("sync hooks: pending and markSynced", () => {
      it("every local write marks the entry pending; downloads don't", async () => {
        const { repo, setTime } = await setupWithIncoming();
        expect(await repo.pendingCount()).toBe(0);

        setTime(T0 + 2_000);
        await repo.update(INCOMING_ID, { servings: 1 });
        expect(await repo.pendingCount()).toBe(1);
        expect(await repo.markSynced(INCOMING_ID, T0 + 2_000)).toBe(true);
        expect(await repo.pendingCount()).toBe(0);

        setTime(T0 + 3_000);
        await repo.remove(INCOMING_ID);
        expect(await repo.pendingCount()).toBe(1);
      });

      it("lists the oldest edits first, up to the limit", async () => {
        const { repo, setTime } = await setup();
        const ids: string[] = [];
        for (let index = 0; index < 3; index += 1) {
          setTime(T0 + 1_000 * (3 - index));
          ids.push(expectOk(await repo.add(ENTRY_INPUT)).id);
        }
        expect((await repo.listPending(2)).map((record) => record.id)).toEqual([ids[2], ids[1]]);
        expect(await repo.listPending(MAX_PENDING_BATCH)).toHaveLength(3);
      });

      it.each([0, -1, 1.5, NaN, MAX_PENDING_BATCH + 1])("lists nothing for limit %p", async (limit) => {
        const { repo } = await setup();
        await repo.add(ENTRY_INPUT);
        expect(await repo.listPending(limit)).toEqual([]);
      });

      it("markSynced clears pending only when updatedAt still matches", async () => {
        const { repo } = await setup();
        const entry = expectOk(await repo.add(ENTRY_INPUT));
        expect(await repo.markSynced(entry.id, entry.updatedAt - 1)).toBe(false);
        expect(await repo.pendingCount()).toBe(1);
        expect(await repo.markSynced(entry.id, entry.updatedAt)).toBe(true);
        expect(await repo.listPending(10)).toEqual([]);
        expect(await repo.markSynced(entry.id, entry.updatedAt)).toBe(false);
      });

      it("an edit made during an upload stays pending", async () => {
        const { repo, setTime } = await setup();
        const entry = expectOk(await repo.add(ENTRY_INPUT));
        const [uploading] = await repo.listPending(10);

        setTime(T0 + 5_000);
        await repo.update(entry.id, { servings: 7 });
        expect(await repo.markSynced(uploading.id, uploading.data.updatedAt)).toBe(false);

        const [next] = await repo.listPending(10);
        expect(next.data).toMatchObject({ servings: 7, updatedAt: T0 + 5_000 });
      });

      it("markSynced ignores unsafe IDs and bad timestamps", async () => {
        const { repo } = await setup();
        const entry = expectOk(await repo.add(ENTRY_INPUT));
        expect(await repo.markSynced("../x", entry.updatedAt)).toBe(false);
        expect(await repo.markSynced(entry.id, NaN)).toBe(false);
        expect(await repo.markSynced(entry.id, -1)).toBe(false);
        expect(await repo.pendingCount()).toBe(1);
      });
    });

    describe("mergeIncoming", () => {
      it("stores a valid entry under the ID, not marked pending", async () => {
        const { repo } = await setupWithIncoming();
        expect(await repo.getById(INCOMING_ID)).toEqual({ ...INCOMING_ENTRY, id: INCOMING_ID });
        expect(await repo.pendingCount()).toBe(0);
      });

      it("stores the parsed data, not the raw input", async () => {
        const { repo } = await setup();
        await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_ENTRY, id: "other", isAdmin: true });
        const entry = await repo.getById(INCOMING_ID);
        expect(entry?.id).toBe(INCOMING_ID);
        expect(entry).not.toHaveProperty("isAdmin");
      });

      it("last edit wins: newer replaces, older and equal keep the local copy", async () => {
        const { repo } = await setupWithIncoming();
        expect(await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_ENTRY, servings: 2, updatedAt: T0 + 10 })).toBe(
          "applied",
        );
        expect(await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_ENTRY, servings: 3, updatedAt: T0 + 5 })).toBe(
          "kept_local",
        );
        expect(await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_ENTRY, servings: 4, updatedAt: T0 + 10 })).toBe(
          "kept_local",
        );
        expect((await repo.getById(INCOMING_ID))?.servings).toBe(2);
      });

      it("a newer download replaces a local edit, which is then no longer pending", async () => {
        const { repo } = await setupWithIncoming();
        await repo.update(INCOMING_ID, { servings: 1 });
        expect(await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_ENTRY, servings: 8, updatedAt: T0 + 50_000 })).toBe(
          "applied",
        );
        expect((await repo.getById(INCOMING_ID))?.servings).toBe(8);
        expect(await repo.pendingCount()).toBe(0);
      });

      it("never brings a removed entry back, even with a newer copy", async () => {
        const { repo, setTime } = await setupWithIncoming();
        setTime(T0 + 5_000);
        await repo.remove(INCOMING_ID);

        for (const updatedAt of [T0, T0 + 5_000, T0 + 60_000]) {
          expect(await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_ENTRY, updatedAt })).toBe("kept_local");
        }
        expect(await repo.getById(INCOMING_ID)).toBeUndefined();
        expect(await everything(repo)).toEqual([]);
      });

      it("applies a newer removed copy, and the entry then stays removed", async () => {
        const { repo } = await setupWithIncoming();
        expect(
          await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_ENTRY, updatedAt: T0 + 10, deletedAt: T0 + 10 }),
        ).toBe("applied");
        expect(await repo.getById(INCOMING_ID)).toBeUndefined();
        expect(await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_ENTRY, updatedAt: T0 + 20 })).toBe("kept_local");
      });

      it.each([
        { recipeId: "'; DROP TABLE recipes;--" },
        { recipeId: "<script>alert(1)</script>" },
        { date: "2026-02-30" },
        { mealType: "snack" },
        { servings: 0 },
        { updatedAt: "tomorrow" },
        { updatedAt: T0 - 1 },
        { schemaVersion: 2 },
      ])("rejects invalid data %p and stores nothing", async (patch) => {
        const { repo } = await setup();
        expect(await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_ENTRY, ...patch })).toBe("invalid");
        expect(await everything(repo)).toEqual([]);
      });

      it.each(["", "../x", "a/b", "ABC", "a".repeat(101), "'; DROP TABLE meal_plan_entries;--"])(
        "rejects unsafe ID %p",
        async (id) => {
          const { repo } = await setup();
          expect(await repo.mergeIncoming(id, INCOMING_ENTRY)).toBe("invalid");
          expect(await everything(repo)).toEqual([]);
        },
      );

      it("round trip: what listPending uploads, another device stores as the same entry", async () => {
        const phone = await setup();
        const entry = expectOk(await phone.repo.add(ENTRY_INPUT));
        const [upload] = await phone.repo.listPending(10);

        const tablet = await setup();
        expect(await tablet.repo.mergeIncoming(upload.id, upload.data)).toBe("applied");
        expect(await tablet.repo.getById(entry.id)).toStrictEqual(entry);
      });
    });

    it("clear removes every entry, pending ones too, and notifies", async () => {
      const { repo } = await setupWithIncoming();
      const entry = expectOk(await repo.add(ENTRY_INPUT));
      const listener = jest.fn();
      repo.subscribe(listener);

      await repo.clear();
      expect(await everything(repo)).toEqual([]);
      expect(await repo.getById(entry.id)).toBeUndefined();
      expect(await repo.pendingCount()).toBe(0);
      expect(await repo.listPending(10)).toEqual([]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("notifies after every change until unsubscribed", async () => {
      const { repo } = await setup();
      const listener = jest.fn();
      const unsubscribe = repo.subscribe(listener);

      const entry = expectOk(await repo.add(ENTRY_INPUT));
      await repo.update(entry.id, { servings: 2 });
      await repo.remove(entry.id);
      await repo.mergeIncoming(INCOMING_ID, INCOMING_ENTRY);
      expect(listener).toHaveBeenCalledTimes(4);

      // Rejected writes, kept-local merges and markSynced do not notify.
      await repo.add({ ...ENTRY_INPUT, servings: 0 });
      await repo.update(INCOMING_ID, { servings: 0 });
      await repo.mergeIncoming(INCOMING_ID, INCOMING_ENTRY);
      await repo.markSynced(entry.id, T0 + 1_002);
      expect(listener).toHaveBeenCalledTimes(4);

      unsubscribe();
      await repo.add(ENTRY_INPUT);
      expect(listener).toHaveBeenCalledTimes(4);
    });
  });
}
