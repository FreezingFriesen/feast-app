import { formatMinutes, totalMinutes } from "../recipeTime";

describe("totalMinutes", () => {
  it("adds prep and cook time", () => {
    expect(totalMinutes({ prepTimeMinutes: 10, cookTimeMinutes: 25 })).toBe(35);
  });

  it("uses whichever one was entered", () => {
    expect(totalMinutes({ prepTimeMinutes: 15 })).toBe(15);
    expect(totalMinutes({ cookTimeMinutes: 40 })).toBe(40);
  });

  it("is null when neither was entered, so no time is shown", () => {
    expect(totalMinutes({})).toBeNull();
  });

  it("keeps an entered zero", () => {
    expect(totalMinutes({ prepTimeMinutes: 0 })).toBe(0);
    expect(totalMinutes({ prepTimeMinutes: 0, cookTimeMinutes: 0 })).toBe(0);
  });

  it("handles the largest times the recipe schema allows", () => {
    expect(totalMinutes({ prepTimeMinutes: 1440, cookTimeMinutes: 1440 })).toBe(2880);
  });
});

describe("formatMinutes", () => {
  it("shows minutes under an hour", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(1)).toBe("1 min");
    expect(formatMinutes(59)).toBe("59 min");
  });

  it("shows whole hours without minutes", () => {
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(120)).toBe("2 h");
  });

  it("shows hours and minutes", () => {
    expect(formatMinutes(61)).toBe("1 h 1 min");
    expect(formatMinutes(95)).toBe("1 h 35 min");
    expect(formatMinutes(2880)).toBe("48 h");
  });
});
