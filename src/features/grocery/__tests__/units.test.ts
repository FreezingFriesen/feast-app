import {
  baseToGrams,
  convertWithinFamily,
  fromBase,
  metricDisplay,
  toBase,
  unitFamily,
  type Unit,
  type UnitFamily,
} from "../units";

// Within a relative 1e-12 of the expected value (floating point can differ in the last
// digit or two; anything visible to a user would be far bigger).
function expectClose(actual: number | undefined, expected: number) {
  expect(actual).toBeDefined();
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(Math.abs(expected) * 1e-12);
}

// The quantities every pair is checked at: the smallest typical amount, one, and the
// values either side of the kg/l switch, up to the largest quantity a recipe row allows.
const BOUNDARIES = [0.001, 1, 999, 1000, 100000] as const;

// [from, to, the result for each of BOUNDARIES]. Every expected value here was worked out
// independently from the definitions with exact fractions (1 lb = 0.45359237 kg exactly,
// 1 oz = 1/16 lb, 1 cup = 250 ml, 1 tbsp = 15 ml, 1 tsp = 5 ml), not from the app's
// constants, then written in as literals. Spot checks: 1 lb = 16 oz; 1 cup = 50 tsp;
// 1 l = 4 cups; 1 tbsp = 3 tsp.
const MASS_PAIRS: readonly [Unit, Unit, readonly number[]][] = [
  ["g", "kg", [1e-6, 0.001, 0.999, 1, 100]],
  ["kg", "g", [1, 1000, 999000, 1000000, 100000000]],
  ["g", "oz", [3.5273961949580415e-5, 0.035273961949580414, 35.23868798763083, 35.27396194958041, 3527.396194958041]],
  ["oz", "g", [0.028349523125, 28.349523125, 28321.173601875, 28349.523125, 2834952.3125]],
  ["g", "lb", [2.204622621848776e-6, 0.002204622621848776, 2.202417999226927, 2.2046226218487757, 220.46226218487757]],
  ["lb", "g", [0.45359237, 453.59237, 453138.77763, 453592.37, 45359237]],
  ["kg", "oz", [0.035273961949580414, 35.27396194958041, 35238.68798763083, 35273.961949580415, 3527396.1949580414]],
  ["oz", "kg", [2.8349523125e-5, 0.028349523125, 28.321173601875, 28.349523125, 2834.9523125]],
  ["kg", "lb", [0.002204622621848776, 2.2046226218487757, 2202.417999226927, 2204.622621848776, 220462.2621848776]],
  ["lb", "kg", [0.00045359237, 0.45359237, 453.13877763, 453.59237, 45359.237]],
  ["oz", "lb", [6.25e-5, 0.0625, 62.4375, 62.5, 6250]],
  ["lb", "oz", [0.016, 16, 15984, 16000, 1600000]],
];

const VOLUME_PAIRS: readonly [Unit, Unit, readonly number[]][] = [
  ["ml", "l", [1e-6, 0.001, 0.999, 1, 100]],
  ["l", "ml", [1, 1000, 999000, 1000000, 100000000]],
  ["ml", "tsp", [0.0002, 0.2, 199.8, 200, 20000]],
  ["tsp", "ml", [0.005, 5, 4995, 5000, 500000]],
  ["ml", "tbsp", [6.666666666666667e-5, 0.06666666666666667, 66.6, 66.66666666666667, 6666.666666666667]],
  ["tbsp", "ml", [0.015, 15, 14985, 15000, 1500000]],
  ["ml", "cup", [4e-6, 0.004, 3.996, 4, 400]],
  ["cup", "ml", [0.25, 250, 249750, 250000, 25000000]],
  ["l", "tsp", [0.2, 200, 199800, 200000, 20000000]],
  ["tsp", "l", [5e-6, 0.005, 4.995, 5, 500]],
  ["l", "tbsp", [0.06666666666666667, 66.66666666666667, 66600, 66666.66666666667, 6666666.666666667]],
  ["tbsp", "l", [1.5e-5, 0.015, 14.985, 15, 1500]],
  ["l", "cup", [0.004, 4, 3996, 4000, 400000]],
  ["cup", "l", [0.00025, 0.25, 249.75, 250, 25000]],
  ["tsp", "tbsp", [0.0003333333333333333, 0.3333333333333333, 333, 333.3333333333333, 33333.333333333336]],
  ["tbsp", "tsp", [0.003, 3, 2997, 3000, 300000]],
  ["tsp", "cup", [2e-5, 0.02, 19.98, 20, 2000]],
  ["cup", "tsp", [0.05, 50, 49950, 50000, 5000000]],
  ["tbsp", "cup", [6e-5, 0.06, 59.94, 60, 6000]],
  ["cup", "tbsp", [0.016666666666666666, 16.666666666666668, 16650, 16666.666666666668, 1666666.6666666667]],
];

const cases = (pairs: typeof MASS_PAIRS) =>
  pairs.flatMap(([from, to, expected]) =>
    BOUNDARIES.map((quantity, index) => [quantity, from, to, expected[index]] as const),
  );

describe("convertWithinFamily", () => {
  it("has a pair in both directions for every two units of each family", () => {
    // 4 mass units: 6 pairs, 12 directions. 5 volume units: 10 pairs, 20 directions.
    expect(MASS_PAIRS).toHaveLength(12);
    expect(VOLUME_PAIRS).toHaveLength(20);
    const directions = [...MASS_PAIRS, ...VOLUME_PAIRS].map(([from, to]) => `${from}>${to}`);
    expect(new Set(directions).size).toBe(directions.length);
  });

  it.each(cases(MASS_PAIRS))("mass: %p %s -> %s", (quantity, from, to, expected) => {
    expectClose(convertWithinFamily(quantity, from, to), expected);
  });

  it.each(cases(VOLUME_PAIRS))("volume: %p %s -> %s", (quantity, from, to, expected) => {
    expectClose(convertWithinFamily(quantity, from, to), expected);
  });

  it("returns the same amount for the same unit", () => {
    expect(convertWithinFamily(0.1, "cup", "cup")).toBe(0.1);
    expect(convertWithinFamily(3, "pinch", "pinch")).toBe(3);
  });

  it.each([
    ["g", "ml"],
    ["cup", "g"],
    ["piece", "g"],
    ["pinch", "tsp"],
    ["piece", "pinch"],
  ] as const)("can't convert %s to %s without ingredient data", (from, to) => {
    expect(convertWithinFamily(1, from, to)).toBeUndefined();
  });
});

describe("unit families and base units", () => {
  it.each([
    ["g", "mass"],
    ["kg", "mass"],
    ["oz", "mass"],
    ["lb", "mass"],
    ["ml", "volume"],
    ["l", "volume"],
    ["tsp", "volume"],
    ["tbsp", "volume"],
    ["cup", "volume"],
    ["piece", "piece"],
    ["pinch", "pinch"],
  ] as const)("%s is %s", (unit, family) => {
    expect(unitFamily(unit)).toBe(family);
  });

  it("adds up in grams, millilitres, pieces and pinches", () => {
    expect(toBase(2, "kg")).toBe(2000);
    expect(toBase(2, "cup")).toBe(500);
    expect(toBase(3, "tbsp")).toBe(45);
    expect(toBase(4, "piece")).toBe(4);
    expect(toBase(1, "pinch")).toBe(1);
    expect(fromBase(500, "cup")).toBe(2);
    expect(fromBase(1500, "l")).toBe(1.5);
  });
});

describe("baseToGrams (conversion across families)", () => {
  // A fake ingredient: 125 g per cup (like flour), 50 g per piece (like an egg).
  const density = { gramsPerCup: 125, gramsPerPiece: 50 };

  it("uses gramsPerCup for volume: ml / 250 x gramsPerCup", () => {
    expect(baseToGrams(500, "volume", density)).toBe(250); // 2 cups of flour
    expect(baseToGrams(1000, "volume", { gramsPerCup: 120 })).toBe(480); // 1 l at 120 g/cup
    expect(baseToGrams(5, "volume", density)).toBe(2.5); // 1 tsp
  });

  it("uses gramsPerPiece for pieces", () => {
    expect(baseToGrams(3, "piece", density)).toBe(150);
  });

  it("keeps grams as they are", () => {
    expect(baseToGrams(250, "mass", {})).toBe(250);
  });

  it.each([
    ["volume", {}],
    ["volume", { gramsPerPiece: 50 }],
    ["piece", {}],
    ["piece", { gramsPerCup: 125 }],
    ["pinch", { gramsPerCup: 125, gramsPerPiece: 50 }],
  ] as [UnitFamily, object][])("says it can't convert %s with %p, never a number", (family, data) => {
    expect(baseToGrams(100, family, data)).toBeUndefined();
  });
});

describe("metricDisplay (the unit for mixed units)", () => {
  it.each([
    [500, "mass", 500, "g"],
    [999, "mass", 999, "g"],
    [999.99, "mass", 999.99, "g"],
    // Shows as 1000.00 after rounding, so it reads "1 kg", not "1000 g".
    [999.996, "mass", 0.999996, "kg"],
    [1000, "mass", 1, "kg"],
    [2500, "mass", 2.5, "kg"],
    [999, "volume", 999, "ml"],
    [1000, "volume", 1, "l"],
    [1250, "volume", 1.25, "l"],
    [5000, "piece", 5000, "piece"],
    [2000, "pinch", 2000, "pinch"],
  ] as const)("%p in %s base units shows as %p %s", (base, family, quantity, unit) => {
    const shown = metricDisplay(base, family);
    expect(shown.unit).toBe(unit);
    expectClose(shown.quantity, quantity);
  });
});
