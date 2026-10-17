import {
  addDays,
  addMonths,
  formatDay,
  formatMonthYear,
  formatWeekRange,
  monthBounds,
  monthGrid,
  startOfWeek,
  todayKey,
  weekDays,
} from "../dates";

describe("todayKey", () => {
  it("uses the local calendar day", () => {
    expect(todayKey(() => new Date(2026, 9, 17, 23, 59).getTime())).toBe("2026-10-17");
    expect(todayKey(() => new Date(2026, 9, 18, 0, 1).getTime())).toBe("2026-10-18");
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("steps through every day of a year without skipping or repeating (DST safe)", () => {
    const keys = new Set<string>();
    let key = "2026-01-01";
    for (let i = 0; i < 365; i += 1) {
      keys.add(key);
      key = addDays(key, 1);
    }
    expect(keys.size).toBe(365);
    expect(key).toBe("2027-01-01");
  });
});

describe("addMonths", () => {
  it.each([
    ["2026-01-31", 1, "2026-02-28"],
    ["2028-01-31", 1, "2028-02-29"],
    ["2026-03-31", -1, "2026-02-28"],
    ["2026-12-15", 1, "2027-01-15"],
    ["2026-01-15", -1, "2025-12-15"],
  ])("%s %+d month -> %s", (key, months, expected) => {
    expect(addMonths(key, months)).toBe(expected);
  });
});

describe("startOfWeek (Monday)", () => {
  it.each([
    ["2026-10-19", "2026-10-19"], // Monday
    ["2026-10-25", "2026-10-19"], // Sunday
    ["2026-11-01", "2026-10-26"], // across a month
    ["2027-01-01", "2026-12-28"], // across a year
  ])("%s -> %s", (key, expected) => {
    expect(startOfWeek(key)).toBe(expected);
  });

  it("weekDays returns Monday to Sunday", () => {
    expect(weekDays("2026-10-21")).toEqual([
      "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22",
      "2026-10-23", "2026-10-24", "2026-10-25",
    ]);
  });
});

describe("monthGrid", () => {
  it("pads a month that starts on Sunday (Feb 2026)", () => {
    const rows = monthGrid("2026-02-14");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual([null, null, null, null, null, null, "2026-02-01"]);
    expect(rows[4]).toEqual([
      "2026-02-23", "2026-02-24", "2026-02-25", "2026-02-26",
      "2026-02-27", "2026-02-28", null,
    ]);
  });

  it("includes Feb 29 in a leap year (Feb 2028)", () => {
    const cells = monthGrid("2028-02-01").flat();
    expect(cells.filter((cell) => cell !== null)).toHaveLength(29);
    expect(cells[0]).toBeNull(); // Feb 1 2028 is a Tuesday
    expect(cells[1]).toBe("2028-02-01");
    expect(cells).toContain("2028-02-29");
  });

  it("needs only 4 rows for a 28-day month starting on Monday (Feb 2027)", () => {
    const rows = monthGrid("2027-02-10");
    expect(rows).toHaveLength(4);
    expect(rows.flat()).not.toContain(null);
  });

  it("monthBounds matches the first and last day", () => {
    expect(monthBounds("2026-02-14")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthBounds("2026-10-17")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
  });
});

describe("labels", () => {
  it("formats days and months", () => {
    expect(formatDay("2026-10-19")).toBe("Mon, Oct 19");
    expect(formatMonthYear("2026-10-19")).toBe("October 2026");
  });

  it.each([
    ["2026-10-21", "Oct 19 – 25"],
    ["2026-10-01", "Sep 28 – Oct 4"],
    ["2026-12-30", "Dec 28, 2026 – Jan 3, 2027"],
  ])("week of %s is %s", (key, expected) => {
    expect(formatWeekRange(key)).toBe(expected);
  });
});
