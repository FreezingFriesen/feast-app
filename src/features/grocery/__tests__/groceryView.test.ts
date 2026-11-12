import { startOfWeek } from "@/features/meal-planner/dates";
import {
  amountText,
  currentWeekStart,
  groceryWriteMessage,
  isNavigableWeek,
  orderForDisplay,
  rowAccessibilityLabel,
  skippedMealsMessage,
} from "../groceryView";

describe("orderForDisplay", () => {
  it("moves checked rows to the end and keeps the order otherwise", () => {
    const rows = [
      { name: "a", checked: true },
      { name: "b", checked: false },
      { name: "c", checked: true },
      { name: "d", checked: false },
    ];
    expect(orderForDisplay(rows, (row) => row.checked).map((row) => row.name)).toEqual(["b", "d", "a", "c"]);
  });

  it("returns a new list and handles empty input", () => {
    const rows = [{ checked: false }];
    expect(orderForDisplay(rows, (row) => row.checked)).not.toBe(rows);
    expect(orderForDisplay([], () => true)).toEqual([]);
  });
});

describe("skippedMealsMessage", () => {
  it.each([
    [0, null],
    [-1, null],
    [1, "1 planned meal was left out because its recipe is no longer available."],
    [3, "3 planned meals were left out because their recipes are no longer available."],
  ])("%p -> %p", (count, expected) => {
    expect(skippedMealsMessage(count)).toBe(expected);
  });
});

describe("row text", () => {
  it("shows an amount, or nothing for an item without one", () => {
    expect(amountText(2, "cup")).toBe("2 cups");
    expect(amountText(undefined, undefined)).toBe("");
    expect(amountText(2, undefined)).toBe("");
  });

  it("labels a row with the name and the amount in words", () => {
    expect(rowAccessibilityLabel({ name: "Flour", quantity: 500, unit: "g" })).toBe("Flour, 500 grams");
    expect(rowAccessibilityLabel({ name: "Paper towels" })).toBe("Paper towels");
    expect(rowAccessibilityLabel({ name: "Flour", quantity: 2, unit: "cup", uncombined: true })).toBe(
      "Flour, 2 cups. Also listed in another unit",
    );
  });
});

describe("groceryWriteMessage", () => {
  it.each([
    ["check_limit", "You can check off up to 10500 items in a week."],
    ["item_limit", "You can add up to 100 items to a week's list."],
    ["invalid", "That item couldn't be saved. Check it and try again."],
    ["failed", "Couldn't save that change. Please try again."],
  ] as const)("%s", (problem, expected) => {
    expect(groceryWriteMessage(problem)).toBe(expected);
  });
});

describe("weeks", () => {
  it("the current week starts on this week's Monday", () => {
    // Wednesday 11 November 2026, noon local time.
    const wednesday = new Date(2026, 10, 11, 12).getTime();
    expect(currentWeekStart(() => wednesday)).toBe("2026-11-09");
    expect(startOfWeek(currentWeekStart())).toBe(currentWeekStart());
  });

  it.each([
    ["2026-11-09", true],
    ["2000-01-03", true], // the first Monday on or after 2000-01-01
    ["2100-12-20", true], // the last week that ends by 2100-12-31
    ["1999-12-27", false], // starts before the planner's range
    ["2100-12-27", false], // ends after it
    ["2026-11-10", false], // a Tuesday
    ["../x", false],
    ["", false],
  ])("week starting %p can be shown: %p", (start, expected) => {
    expect(isNavigableWeek(start)).toBe(expected);
  });
});
