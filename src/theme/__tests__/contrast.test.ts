import { brand, colors, contrastPairs, mealTypeColors } from "../colors";
import { contrastRatio, MIN_CONTRAST, relativeLuminance } from "../contrast";

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#09693F", "#09693F")).toBeCloseTo(1, 5);
  });

  it("doesn't depend on which colour is the foreground", () => {
    expect(contrastRatio("#E98814", "#FFF2E9")).toBeCloseTo(contrastRatio("#FFF2E9", "#E98814"), 10);
  });

  it("matches the ratios worked out for the brand palette", () => {
    // Values from the design brief (docs/DESIGN_SYSTEM.md, Contrast).
    expect(contrastRatio(brand.green, brand.cream)).toBeCloseTo(6.16, 2);
    expect(contrastRatio(brand.green, "#FFFFFF")).toBeCloseTo(6.77, 2);
    expect(contrastRatio(brand.yellow, brand.green)).toBeCloseTo(5.37, 2);
    expect(contrastRatio("#1F1F1F", brand.orange)).toBeCloseTo(6.28, 2);
    expect(contrastRatio(brand.orange, brand.cream)).toBeCloseTo(2.39, 2);
    expect(contrastRatio(brand.yellow, brand.cream)).toBeCloseTo(1.15, 2);
  });

  it("accepts lower-case hex", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
  });

  it("refuses anything that isn't #RRGGBB", () => {
    for (const value of ["#FFF", "FFFFFF", "#GGGGGG", "rgb(0,0,0)", "", "#FFFFFF00"]) {
      expect(() => relativeLuminance(value)).toThrow();
    }
  });
});

describe("colour roles", () => {
  it("are all #RRGGBB, so they can be checked", () => {
    const values = [...Object.values(brand), ...Object.values(colors), ...Object.values(mealTypeColors)];
    for (const value of values) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("keep orange and yellow out of text on white or cream", () => {
    // The two brand colours that fail as text. Check nobody pairs them by accident.
    for (const pair of contrastPairs.filter((p) => p.kind === "text")) {
      if (pair.background === colors.background || pair.background === colors.chrome) {
        expect([brand.orange, brand.yellow]).not.toContain(pair.foreground);
      }
    }
  });
});

describe("contrastPairs", () => {
  it.each(contrastPairs.map((pair) => [pair.use, pair] as const))("%s passes", (_use, pair) => {
    expect(contrastRatio(pair.foreground, pair.background)).toBeGreaterThanOrEqual(MIN_CONTRAST[pair.kind]);
  });
});
