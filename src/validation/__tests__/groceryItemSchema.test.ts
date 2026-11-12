import { addDays, startOfWeek } from "@/features/meal-planner/dates";
import {
  groceryCheckChangeSchema,
  groceryItemKeySchema,
  manualGroceryItemSchema,
  MAX_CHECKED_ITEMS_PER_WEEK,
  storedGroceryCheckSchema,
  storedManualGroceryItemSchema,
  weekStartSchema,
} from "../groceryItemSchema";

const valid = { name: "Paper towels" };
const withAmount = { name: "Milk", quantity: 2, unit: "l" };
const T0 = Date.UTC(2026, 10, 9);
const stored = { ...withAmount, weekStart: "2026-11-09", checked: false, createdAt: T0, schemaVersion: 1 };

const accepts = (input: unknown) => manualGroceryItemSchema.safeParse(input).success;

const ATTACK_STRINGS = [
  "'; DROP TABLE recipes;--",
  "<script>alert(1)</script>",
  "a".repeat(10_000),
  "",
  "🍕",
  "​", // only a zero-width space
  "\u0000\u0007", // only control characters
];

describe("manualGroceryItemSchema", () => {
  it("accepts a name alone, and a name with an amount and unit", () => {
    expect(manualGroceryItemSchema.parse(valid)).toEqual(valid);
    expect(manualGroceryItemSchema.parse(withAmount)).toEqual(withAmount);
  });

  it("drops fields that are not in the schema", () => {
    expect(manualGroceryItemSchema.parse({ ...withAmount, id: "chosen", checked: true, isAdmin: true })).toEqual(
      withAmount,
    );
  });

  it("cleans the name before checking it (saved as the parsed result)", () => {
    expect(manualGroceryItemSchema.parse({ name: "  Crème​ fraîche \u0007" }).name).toBe("Crème fraîche");
    expect(manualGroceryItemSchema.parse({ name: "Ben & Jerry's (2/3)" }).name).toBe("Ben & Jerry's (2/3)");
  });

  it.each([
    [0, false],
    [1, true],
    [100, true],
    [101, false],
  ])("a name of %p characters -> %p", (length, ok) => {
    expect(accepts({ name: "a".repeat(length) })).toBe(ok);
  });

  it.each([
    [0, false],
    [-1, false],
    [0.001, true],
    [1, true],
    [100_000, true],
    [100_001, false],
    [1_000_000, false],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
    ["2", false],
  ])("quantity %p -> %p", (quantity, ok) => {
    expect(accepts({ name: "Milk", quantity, unit: "l" })).toBe(ok);
  });

  it.each(["cups", "Cup", "", "litre", "'; DROP TABLE recipes;--"])("rejects the unit %p", (unit) => {
    expect(accepts({ name: "Milk", quantity: 1, unit })).toBe(false);
  });

  it("needs a unit with an amount, and an amount with a unit, reported on the missing box", () => {
    const noUnit = manualGroceryItemSchema.safeParse({ name: "Milk", quantity: 2 });
    expect(noUnit.error?.issues.map((issue) => issue.path)).toEqual([["unit"]]);
    const noAmount = manualGroceryItemSchema.safeParse({ name: "Milk", unit: "l" });
    expect(noAmount.error?.issues.map((issue) => issue.path)).toEqual([["quantity"]]);
  });

  it.each(ATTACK_STRINGS)("rejects the name %p", (name) => {
    expect(accepts({ name })).toBe(false);
  });

  it("rejects names with characters outside the allowlist", () => {
    for (const name of ["a<b", "x;y", 'say "hi"', "back\\slash", "tab\there"]) {
      expect(accepts({ name })).toBe(false);
    }
  });
});

describe("weekStartSchema", () => {
  it.each(["2026-11-09", "2000-01-03", "2028-02-28", "2100-12-27"])("accepts the Monday %p", (key) => {
    expect(weekStartSchema.safeParse(key).success).toBe(true);
  });

  it.each([
    "2026-11-10", // Tuesday
    "2026-11-15", // Sunday
    "2026-02-30", // not a real day
    "1999-12-27", // a Monday before the range
    "26-11-09",
    "2026-11-09T00:00",
    "../x",
    "",
    ...ATTACK_STRINGS,
  ])("rejects %p", (key) => {
    expect(weekStartSchema.safeParse(key).success).toBe(false);
  });

  it("agrees with startOfWeek for every day of 2026 to 2028, including the DST changes", () => {
    let key = "2026-01-01";
    while (key <= "2028-12-31") {
      expect(weekStartSchema.safeParse(key).success).toBe(startOfWeek(key) === key);
      key = addDays(key, 1);
    }
  });
});

describe("groceryItemKeySchema", () => {
  it("accepts the keys the list makes", () => {
    for (const key of ["name:flour|mass", "id:all_purpose_flour|volume", "name:crème fraîche|volume"]) {
      expect(groceryItemKeySchema.parse(key)).toBe(key);
    }
  });

  it.each([
    [1, true],
    [250, true],
    [251, false],
    [10_000, false],
  ])("a key of %p characters -> %p", (length, ok) => {
    expect(groceryItemKeySchema.safeParse("k".repeat(length)).success).toBe(ok);
  });

  it("rejects an empty key, and keeps attack text as plain text", () => {
    expect(groceryItemKeySchema.safeParse("").success).toBe(false);
    expect(groceryItemKeySchema.safeParse("​").success).toBe(false);
    expect(groceryItemKeySchema.parse("'; DROP TABLE recipes;--")).toBe("'; DROP TABLE recipes;--");
  });
});

describe("stored grocery records", () => {
  it("accepts a stored manual item", () => {
    expect(storedManualGroceryItemSchema.parse(stored)).toEqual(stored);
  });

  it.each([
    { weekStart: "2026-11-10" },
    { checked: 1 },
    { createdAt: 5 },
    { createdAt: "now" },
    { schemaVersion: 2 },
    { unit: undefined },
  ])("rejects a stored item with %p", (patch) => {
    expect(storedManualGroceryItemSchema.safeParse({ ...stored, ...patch }).success).toBe(false);
  });

  it("checks a check mark and a check change", () => {
    expect(storedGroceryCheckSchema.safeParse({ weekStart: "2026-11-09", itemKey: "name:flour|mass" }).success).toBe(
      true,
    );
    expect(
      groceryCheckChangeSchema.safeParse({ weekStart: "2026-11-09", itemKey: "name:flour|mass", checked: "yes" })
        .success,
    ).toBe(false);
  });

  it("caps check marks at the most lines a week can have", () => {
    // 7 days x 3 slots x 10 entries x 50 ingredient rows.
    expect(MAX_CHECKED_ITEMS_PER_WEEK).toBe(10_500);
  });
});
