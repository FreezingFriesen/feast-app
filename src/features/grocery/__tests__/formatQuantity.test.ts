import { BELOW_SMALLEST, formatAmount, formatQuantity, NOT_AN_AMOUNT, spokenAmount } from "../formatQuantity";

describe("formatQuantity", () => {
  it.each([
    [1, "1"],
    [3, "3"],
    [0.5, "0.5"],
    [2.1, "2.1"],
    [1.234, "1.23"],
    [1.236, "1.24"],
    [0.30000000000000004, "0.3"],
    [1 / 3, "0.33"],
    [2 / 3, "0.67"],
    [999.999, "1000"],
    [680.388555, "680.39"],
    [0.006, "0.01"],
  ])("%p shows as %p (at most 2 decimal places, no trailing zeros)", (quantity, expected) => {
    expect(formatQuantity(quantity)).toBe(expected);
  });

  it.each([0.004, 0.001, 1 / 100 / 100, 1e-9, Number.MIN_VALUE])(
    "never shows a positive amount as 0: %p shows as \"< 0.01\"",
    (quantity) => {
      expect(formatQuantity(quantity)).toBe(BELOW_SMALLEST);
    },
  );

  it("shows exactly 0 as 0 (the list never has one, but it isn't hidden)", () => {
    expect(formatQuantity(0)).toBe("0");
  });

  it.each([
    // The largest single row: 100000 scaled from 1 serving to 100.
    [100_000 * 100, "10000000"],
    // Far past anything a week could add up to.
    [1e14, "100000000000000"],
    [123_456_789.126, "123456789.13"],
    [1e20, "100000000000000000000"],
    [1e21, "1000000000000000000000"],
    [1.5e22, "15000000000000000000000"],
  ])("never uses exponent notation: %p shows as %p", (quantity, expected) => {
    expect(formatQuantity(quantity)).toBe(expected);
  });

  it("writes out even the largest number in full", () => {
    const text = formatQuantity(1e300);
    expect(text).toMatch(/^1\d{300}$/);
    expect(text).not.toContain("e");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, -0.004])(
    "shows %p as a dash rather than a number",
    (quantity) => {
      expect(formatQuantity(quantity)).toBe(NOT_AN_AMOUNT);
    },
  );
});

describe("formatAmount", () => {
  it.each([
    [3, "cup", "3 cups"],
    [1, "cup", "1 cup"],
    [0.5, "cup", "0.5 cup"],
    [1.5, "cup", "1.5 cups"],
    [2, "piece", "2 pieces"],
    [1, "piece", "1 piece"],
    [2, "pinch", "2 pinches"],
    [0.001, "pinch", "< 0.01 pinch"],
    [500, "g", "500 g"],
    [1.1, "kg", "1.1 kg"],
    [3, "lb", "3 lb"],
    [2, "tbsp", "2 tbsp"],
    [1.004, "cup", "1 cup"],
  ] as const)("%p %s shows as %p", (quantity, unit, expected) => {
    expect(formatAmount(quantity, unit)).toBe(expected);
  });
});

describe("spokenAmount (screen readers)", () => {
  it.each([
    [500, "g", "500 grams"],
    [1, "kg", "1 kilogram"],
    [0.5, "l", "0.5 litres"],
    [2, "ml", "2 millilitres"],
    [3, "tsp", "3 teaspoons"],
    [1, "tbsp", "1 tablespoon"],
    [1, "cup", "1 cup"],
    [8, "oz", "8 ounces"],
    [3, "lb", "3 pounds"],
    [2, "piece", "2 pieces"],
    [0.001, "pinch", "less than 0.01 pinches"],
  ] as const)("%p %s is read as %p", (quantity, unit, expected) => {
    expect(spokenAmount(quantity, unit)).toBe(expected);
  });
});
