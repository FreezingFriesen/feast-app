import { MAX_ENTRIES_PER_SLOT } from "@/validation/mealPlanSchema";
import { ID_PATTERN } from "@/validation/patterns";
import { createInMemoryMealPlanRepository } from "../inMemoryMealPlanRepository";
import type { MealPlanEntry, MealPlanWriteResult } from "../MealPlanRepository";

const input = { date: "2026-10-19", mealType: "dinner", recipeId: "recipe-1", servings: 4 } as const;

// A clock the test controls, so updatedAt values are predictable.
function setup() {
  let time = 1_000;
  const repo = createInMemoryMealPlanRepository(() => time);
  return {
    repo,
    tick: (ms = 1) => {
      time += ms;
    },
  };
}

function expectOk(result: MealPlanWriteResult): MealPlanEntry {
  if (!result.ok) throw new Error(`Expected ok, got ${result.reason}`);
  return result.entry;
}

const everything = (repo: ReturnType<typeof setup>["repo"]) =>
  repo.listBetween("2000-01-01", "2100-12-31");

describe("add", () => {
  it("stores a valid entry with timestamps and a safe ID", async () => {
    const { repo } = setup();
    const entry = expectOk(await repo.add(input));
    expect(entry).toMatchObject({ ...input, createdAt: 1_000, updatedAt: 1_000, schemaVersion: 1 });
    expect(entry.id).toMatch(ID_PATTERN);
    expect(await repo.getById(entry.id)).toEqual(entry);
  });

  it("stores the parsed data, not the raw input", async () => {
    const { repo } = setup();
    const entry = expectOk(await repo.add({ ...input, extra: "x", deletedAt: 5 }));
    expect(entry).not.toHaveProperty("extra");
    expect(entry.deletedAt).toBeUndefined();
  });

  it.each([
    { recipeId: "'; DROP TABLE recipes;--" },
    { recipeId: "<script>alert(1)</script>" },
    { recipeId: "../other-user" },
    { date: "2026-02-30" },
    { mealType: "snack" },
    { servings: 0 },
  ])("rejects %p and writes nothing", async (patch) => {
    const { repo } = setup();
    const result = await repo.add({ ...input, ...patch });
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(await everything(repo)).toEqual([]);
  });

  it(`allows ${MAX_ENTRIES_PER_SLOT} entries per slot`, async () => {
    const { repo } = setup();
    for (let i = 0; i < MAX_ENTRIES_PER_SLOT; i += 1) {
      expectOk(await repo.add(input));
    }
    expect(await repo.add(input)).toEqual({ ok: false, reason: "slot_full" });
    // Other slots are unaffected.
    expectOk(await repo.add({ ...input, mealType: "lunch" }));
  });
});

describe("update", () => {
  it("moves an entry and changes servings, bumping updatedAt only", async () => {
    const { repo, tick } = setup();
    const entry = expectOk(await repo.add(input));
    tick(500);
    const updated = expectOk(
      await repo.update(entry.id, { date: "2026-10-20", mealType: "lunch", servings: 2 }),
    );
    expect(updated).toEqual({
      ...entry,
      date: "2026-10-20",
      mealType: "lunch",
      servings: 2,
      updatedAt: 1_500,
    });
    expect(await repo.getById(entry.id)).toEqual(updated);
  });

  it("keeps fields that are not in the patch", async () => {
    const { repo } = setup();
    const entry = expectOk(await repo.add(input));
    const updated = expectOk(await repo.update(entry.id, { servings: 6 }));
    expect(updated).toMatchObject({ date: input.date, mealType: input.mealType, servings: 6 });
  });

  it("cannot change the recipe", async () => {
    const { repo } = setup();
    const entry = expectOk(await repo.add(input));
    const updated = expectOk(await repo.update(entry.id, { recipeId: "recipe-2" }));
    expect(updated.recipeId).toBe("recipe-1");
  });

  it("rejects an invalid patch and leaves the entry unchanged", async () => {
    const { repo } = setup();
    const entry = expectOk(await repo.add(input));
    expect(await repo.update(entry.id, { servings: 101 })).toMatchObject({ reason: "invalid" });
    expect(await repo.update(entry.id, { date: "<script>alert(1)</script>" })).toMatchObject({ reason: "invalid" });
    expect(await repo.getById(entry.id)).toEqual(entry);
  });

  it("will not move an entry into a full slot, but can edit inside a full slot", async () => {
    const { repo } = setup();
    const inFullSlot: MealPlanEntry[] = [];
    for (let i = 0; i < MAX_ENTRIES_PER_SLOT; i += 1) {
      inFullSlot.push(expectOk(await repo.add(input)));
    }
    const lunch = expectOk(await repo.add({ ...input, mealType: "lunch" }));
    expect(await repo.update(lunch.id, { mealType: "dinner" })).toEqual({ ok: false, reason: "slot_full" });
    expectOk(await repo.update(inFullSlot[0].id, { servings: 2 }));
  });

  it("returns not_found for unknown or unsafe IDs", async () => {
    const { repo } = setup();
    expect(await repo.update("missing", { servings: 2 })).toEqual({ ok: false, reason: "not_found" });
    expect(await repo.update("../x", { servings: 2 })).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("remove (soft delete)", () => {
  it("hides the entry from every read and blocks later updates", async () => {
    const { repo } = setup();
    const entry = expectOk(await repo.add(input));
    expect(await repo.remove(entry.id)).toBe(true);
    expect(await repo.getById(entry.id)).toBeUndefined();
    expect(await everything(repo)).toEqual([]);
    expect(await repo.update(entry.id, { servings: 2 })).toEqual({ ok: false, reason: "not_found" });
    expect(await repo.remove(entry.id)).toBe(false);
  });

  it("frees the slot", async () => {
    const { repo } = setup();
    const entries: MealPlanEntry[] = [];
    for (let i = 0; i < MAX_ENTRIES_PER_SLOT; i += 1) {
      entries.push(expectOk(await repo.add(input)));
    }
    await repo.remove(entries[0].id);
    expectOk(await repo.add(input));
  });

  it("returns false for unknown or unsafe IDs", async () => {
    const { repo } = setup();
    expect(await repo.remove("missing")).toBe(false);
    expect(await repo.remove("")).toBe(false);
    expect(await repo.remove("a/b")).toBe(false);
  });
});

describe("listBetween", () => {
  it("includes both end dates and sorts oldest first", async () => {
    const { repo, tick } = setup();
    for (const date of ["2026-10-26", "2026-10-25", "2026-10-18", "2026-10-19"]) {
      expectOk(await repo.add({ ...input, date }));
      tick();
    }
    const dates = (await repo.listBetween("2026-10-19", "2026-10-25")).map((entry) => entry.date);
    expect(dates).toEqual(["2026-10-25", "2026-10-19"]);
  });

  it("returns nothing for an invalid range", async () => {
    const { repo } = setup();
    expectOk(await repo.add(input));
    expect(await repo.listBetween("'; DROP TABLE recipes;--", "2100-12-31")).toEqual([]);
    expect(await repo.listBetween("2000-01-01", "")).toEqual([]);
  });
});

describe("clear", () => {
  it("removes every entry and notifies", async () => {
    const { repo } = setup();
    const entry = expectOk(await repo.add(input));
    const listener = jest.fn();
    repo.subscribe(listener);
    await repo.clear();
    expect(await everything(repo)).toEqual([]);
    expect(await repo.getById(entry.id)).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("subscribe", () => {
  it("notifies after every change until unsubscribed", async () => {
    const { repo } = setup();
    const listener = jest.fn();
    const unsubscribe = repo.subscribe(listener);

    const entry = expectOk(await repo.add(input));
    await repo.update(entry.id, { servings: 2 });
    await repo.remove(entry.id);
    expect(listener).toHaveBeenCalledTimes(3);

    // Rejected writes do not notify.
    await repo.add({ ...input, servings: 0 });
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    await repo.add(input);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
