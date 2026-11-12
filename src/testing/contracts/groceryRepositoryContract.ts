// Shared behaviour for every GroceryRepository (in-memory and SQLite).
import type { GroceryLimits, GroceryRepository, ManualItemAddResult, ManualGroceryItem } from "@/repositories/GroceryRepository";
import { ID_PATTERN } from "@/validation/patterns";

export const T0 = Date.UTC(2026, 10, 1);
export const WEEK = "2026-11-09";
export const OTHER_WEEK = "2026-11-16";
export const KEY = "name:flour|mass";
export const ITEM_INPUT = { name: "Milk", quantity: 2, unit: "l" } as const;

export function expectAdded(result: ManualItemAddResult): ManualGroceryItem {
  if (!result.ok) throw new Error(`Expected ok, got ${result.reason}`);
  return result.item;
}

// Week values a user (or a deep link, or a tampered database) could hand in.
const BAD_WEEKS = [
  "2026-11-10", // a Tuesday
  "2026-02-30",
  "'; DROP TABLE grocery_checks;--",
  "<script>alert(1)</script>",
  "../x",
  "",
  "a".repeat(10_000),
];

export function describeGroceryRepositoryContract(
  name: string,
  create: (now: () => number, limits?: GroceryLimits) => Promise<GroceryRepository>,
) {
  // A clock the test controls, so createdAt values are predictable.
  async function setup(limits?: GroceryLimits) {
    let time = T0 + 1_000;
    const repo = await create(() => time, limits);
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

  describe(`GroceryRepository contract: ${name}`, () => {
    describe("check marks", () => {
      it("checks and unchecks a line; repeating either changes nothing", async () => {
        const { repo } = await setup();
        expect(await repo.setChecked(WEEK, KEY, true)).toEqual({ ok: true });
        expect(await repo.setChecked(WEEK, KEY, true)).toEqual({ ok: true });
        expect(await repo.listCheckedKeys(WEEK)).toEqual([KEY]);

        expect(await repo.setChecked(WEEK, KEY, false)).toEqual({ ok: true });
        expect(await repo.setChecked(WEEK, KEY, false)).toEqual({ ok: true });
        expect(await repo.listCheckedKeys(WEEK)).toEqual([]);
      });

      it("keeps weeks apart", async () => {
        const { repo } = await setup();
        await repo.setChecked(WEEK, KEY, true);
        await repo.setChecked(OTHER_WEEK, "name:milk|volume", true);
        expect(await repo.listCheckedKeys(WEEK)).toEqual([KEY]);
        expect(await repo.listCheckedKeys(OTHER_WEEK)).toEqual(["name:milk|volume"]);
        await repo.setChecked(OTHER_WEEK, KEY, false);
        expect(await repo.listCheckedKeys(WEEK)).toEqual([KEY]);
      });

      it("stores the cleaned key", async () => {
        const { repo } = await setup();
        await repo.setChecked(WEEK, "  name:flour|mass​ ", true);
        expect(await repo.listCheckedKeys(WEEK)).toEqual([KEY]);
      });

      it("keeps attack text in a key as plain text", async () => {
        const { repo } = await setup();
        const attack = "name:'; drop table grocery_checks;--|mass";
        expect(await repo.setChecked(WEEK, attack, true)).toEqual({ ok: true });
        expect(await repo.listCheckedKeys(WEEK)).toEqual([attack]);
      });

      it.each(BAD_WEEKS)("rejects the week %p and writes nothing", async (week) => {
        const { repo } = await setup();
        expect(await repo.setChecked(week, KEY, true)).toMatchObject({ ok: false, reason: "invalid" });
        expect(await repo.listCheckedKeys(week)).toEqual([]);
      });

      it.each(["", "​", "k".repeat(251), "k".repeat(10_000)])("rejects the key %p", async (key) => {
        const { repo } = await setup();
        expect(await repo.setChecked(WEEK, key, true)).toMatchObject({ ok: false, reason: "invalid" });
        expect(await repo.listCheckedKeys(WEEK)).toEqual([]);
      });

      it("rejects a checked value that isn't true or false", async () => {
        const { repo } = await setup();
        expect(await repo.setChecked(WEEK, KEY, "yes" as never)).toMatchObject({ ok: false, reason: "invalid" });
        expect(await repo.listCheckedKeys(WEEK)).toEqual([]);
      });

      it("refuses a check past the week's limit; unchecking frees room, other weeks are unaffected", async () => {
        const { repo } = await setup({ maxManualItemsPerWeek: 100, maxCheckedItemsPerWeek: 3 });
        for (const key of ["a", "b", "c"]) expect(await repo.setChecked(WEEK, key, true)).toEqual({ ok: true });
        expect(await repo.setChecked(WEEK, "d", true)).toEqual({ ok: false, reason: "limit" });
        // Already checked: still fine at the limit.
        expect(await repo.setChecked(WEEK, "a", true)).toEqual({ ok: true });
        expect(await repo.setChecked(OTHER_WEEK, "d", true)).toEqual({ ok: true });
        await repo.setChecked(WEEK, "a", false);
        expect(await repo.setChecked(WEEK, "d", true)).toEqual({ ok: true });
        expect(await repo.listCheckedKeys(WEEK)).toEqual(["b", "c", "d"]);
      });

      it("lets only the limit through when many checks run at once", async () => {
        const { repo } = await setup({ maxManualItemsPerWeek: 100, maxCheckedItemsPerWeek: 5 });
        const results = await Promise.all(
          Array.from({ length: 12 }, (_, index) => repo.setChecked(WEEK, `key-${index}`, true)),
        );
        expect(results.filter((result) => result.ok)).toHaveLength(5);
        expect(await repo.listCheckedKeys(WEEK)).toHaveLength(5);
      });

      it("returns nothing for an invalid week", async () => {
        const { repo } = await setup();
        for (const week of BAD_WEEKS) expect(await repo.listCheckedKeys(week)).toEqual([]);
      });
    });

    describe("manual items", () => {
      it("adds an item with a safe ID, unchecked, at the current time", async () => {
        const { repo } = await setup();
        const item = expectAdded(await repo.addManualItem(WEEK, ITEM_INPUT));
        expect(item).toEqual({
          ...ITEM_INPUT,
          id: item.id,
          weekStart: WEEK,
          checked: false,
          createdAt: T0 + 1_000,
          schemaVersion: 1,
        });
        expect(item.id).toMatch(ID_PATTERN);
        expect(await repo.listManualItems(WEEK)).toEqual([item]);
      });

      it("stores the parsed data, not the raw input", async () => {
        const { repo } = await setup();
        const item = expectAdded(
          await repo.addManualItem(WEEK, { name: "  Paper​ towels ", id: "chosen-id", checked: true, extra: 1 }),
        );
        expect(item.name).toBe("Paper towels");
        expect(item.id).not.toBe("chosen-id");
        expect(item.checked).toBe(false);
        expect(item).not.toHaveProperty("extra");
        expect(item).not.toHaveProperty("quantity");
        const [listed] = await repo.listManualItems(WEEK);
        expect(JSON.parse(JSON.stringify(listed))).toStrictEqual(listed);
      });

      it.each([
        { name: "'; DROP TABLE recipes;--" },
        { name: "<script>alert(1)</script>" },
        { name: "a".repeat(10_000) },
        { name: "a".repeat(101) },
        { name: "" },
        { name: "​" },
        { name: "Milk", quantity: 0, unit: "l" },
        { name: "Milk", quantity: -1, unit: "l" },
        { name: "Milk", quantity: 100_001, unit: "l" },
        { name: "Milk", quantity: 2 },
        { name: "Milk", unit: "l" },
        { name: "Milk", quantity: 2, unit: "cups" },
        { quantity: 2, unit: "l" },
      ])("rejects %p and writes nothing", async (input) => {
        const { repo } = await setup();
        expect(await repo.addManualItem(WEEK, input)).toMatchObject({ ok: false, reason: "invalid" });
        expect(await repo.listManualItems(WEEK)).toEqual([]);
      });

      it.each(BAD_WEEKS)("rejects the week %p and writes nothing", async (week) => {
        const { repo } = await setup();
        expect(await repo.addManualItem(week, ITEM_INPUT)).toMatchObject({ ok: false, reason: "invalid" });
        expect(await repo.listManualItems(WEEK)).toEqual([]);
      });

      it("refuses to save with a clock outside the timestamp range", async () => {
        const { repo, setTime } = await setup();
        setTime(1_000);
        expect(await repo.addManualItem(WEEK, ITEM_INPUT)).toMatchObject({ ok: false, reason: "invalid" });
        expect(await repo.listManualItems(WEEK)).toEqual([]);
      });

      it("lists a week's items oldest first, in the order added when the time is the same", async () => {
        const { repo, tick } = await setup();
        const first = expectAdded(await repo.addManualItem(WEEK, { name: "First" }));
        const second = expectAdded(await repo.addManualItem(WEEK, { name: "Second" }));
        tick(10);
        const third = expectAdded(await repo.addManualItem(WEEK, { name: "Third" }));
        expectAdded(await repo.addManualItem(OTHER_WEEK, { name: "Other week" }));
        expect((await repo.listManualItems(WEEK)).map((item) => item.id)).toEqual([first.id, second.id, third.id]);
        expect((await repo.listManualItems(OTHER_WEEK)).map((item) => item.name)).toEqual(["Other week"]);
      });

      it("allows 100 items a week, then refuses more; other weeks are unaffected", async () => {
        const { repo } = await setup();
        for (let index = 0; index < 100; index += 1) {
          expectAdded(await repo.addManualItem(WEEK, { name: `Item ${index}` }));
        }
        expect(await repo.addManualItem(WEEK, ITEM_INPUT)).toEqual({ ok: false, reason: "limit" });
        expect(await repo.listManualItems(WEEK)).toHaveLength(100);
        expectAdded(await repo.addManualItem(OTHER_WEEK, ITEM_INPUT));
      });

      it("lets only the limit through when many adds run at once", async () => {
        const { repo } = await setup({ maxManualItemsPerWeek: 4, maxCheckedItemsPerWeek: 100 });
        const results = await Promise.all(Array.from({ length: 10 }, () => repo.addManualItem(WEEK, ITEM_INPUT)));
        expect(results.filter((result) => result.ok)).toHaveLength(4);
        expect(results.filter((result) => !result.ok)).toEqual(Array(6).fill({ ok: false, reason: "limit" }));
        expect(await repo.listManualItems(WEEK)).toHaveLength(4);
      });

      it("checks and unchecks an item", async () => {
        const { repo } = await setup();
        const item = expectAdded(await repo.addManualItem(WEEK, ITEM_INPUT));
        expect(await repo.setManualItemChecked(item.id, true)).toBe(true);
        expect(await repo.listManualItems(WEEK)).toEqual([{ ...item, checked: true }]);
        expect(await repo.setManualItemChecked(item.id, true)).toBe(true);
        expect(await repo.setManualItemChecked(item.id, false)).toBe(true);
        expect(await repo.listManualItems(WEEK)).toEqual([item]);
      });

      it("removes an item", async () => {
        const { repo } = await setup();
        const item = expectAdded(await repo.addManualItem(WEEK, ITEM_INPUT));
        const kept = expectAdded(await repo.addManualItem(WEEK, { name: "Bread" }));
        expect(await repo.removeManualItem(item.id)).toBe(true);
        expect(await repo.removeManualItem(item.id)).toBe(false);
        expect(await repo.listManualItems(WEEK)).toEqual([kept]);
        expect(await repo.setManualItemChecked(item.id, true)).toBe(false);
      });

      it.each(["missing", "", "../x", "a/b", "ABC", "'; DROP TABLE grocery_manual_items;--"])(
        "returns false for the unknown or unsafe ID %p",
        async (id) => {
          const { repo } = await setup();
          expectAdded(await repo.addManualItem(WEEK, ITEM_INPUT));
          expect(await repo.setManualItemChecked(id, true)).toBe(false);
          expect(await repo.removeManualItem(id)).toBe(false);
          expect(await repo.listManualItems(WEEK)).toHaveLength(1);
        },
      );

      it("refuses a checked value that isn't true or false", async () => {
        const { repo } = await setup();
        const item = expectAdded(await repo.addManualItem(WEEK, ITEM_INPUT));
        expect(await repo.setManualItemChecked(item.id, 1 as never)).toBe(false);
        expect(await repo.listManualItems(WEEK)).toEqual([item]);
      });

      it("returns nothing for an invalid week", async () => {
        const { repo } = await setup();
        expectAdded(await repo.addManualItem(WEEK, ITEM_INPUT));
        for (const week of BAD_WEEKS) expect(await repo.listManualItems(week)).toEqual([]);
      });
    });

    it("clear removes every check mark and item, and notifies once", async () => {
      const { repo } = await setup();
      await repo.setChecked(WEEK, KEY, true);
      await repo.setChecked(OTHER_WEEK, KEY, true);
      expectAdded(await repo.addManualItem(WEEK, ITEM_INPUT));
      const listener = jest.fn();
      repo.subscribe(listener);

      await repo.clear();
      expect(await repo.listCheckedKeys(WEEK)).toEqual([]);
      expect(await repo.listCheckedKeys(OTHER_WEEK)).toEqual([]);
      expect(await repo.listManualItems(WEEK)).toEqual([]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("notifies after every change until unsubscribed, and not for refused or empty writes", async () => {
      const { repo } = await setup({ maxManualItemsPerWeek: 1, maxCheckedItemsPerWeek: 1 });
      const listener = jest.fn();
      const unsubscribe = repo.subscribe(listener);

      await repo.setChecked(WEEK, KEY, true);
      await repo.setChecked(WEEK, KEY, false);
      const item = expectAdded(await repo.addManualItem(WEEK, ITEM_INPUT));
      await repo.setManualItemChecked(item.id, true);
      await repo.removeManualItem(item.id);
      expect(listener).toHaveBeenCalledTimes(5);

      // Refused, invalid or no-op writes don't notify.
      await repo.setChecked(WEEK, KEY, false);
      await repo.setChecked(WEEK, "", true);
      await repo.setChecked(WEEK, "a", true);
      await repo.setChecked(WEEK, "a", true);
      await repo.setChecked(WEEK, "b", true);
      expect(listener).toHaveBeenCalledTimes(6);
      expectAdded(await repo.addManualItem(WEEK, ITEM_INPUT));
      await repo.addManualItem(WEEK, ITEM_INPUT);
      await repo.addManualItem(WEEK, { name: "" });
      const [kept] = await repo.listManualItems(WEEK);
      await repo.setManualItemChecked(kept.id, false);
      await repo.removeManualItem("missing");
      expect(listener).toHaveBeenCalledTimes(7);

      unsubscribe();
      await repo.setChecked(OTHER_WEEK, KEY, true);
      expect(listener).toHaveBeenCalledTimes(7);
    });
  });
}
