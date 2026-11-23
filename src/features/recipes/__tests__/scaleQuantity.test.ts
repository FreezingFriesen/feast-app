import { formatQuantity } from "@/features/grocery/formatQuantity";
import { scaleQuantity } from "../scaleQuantity";

describe("scaleQuantity (N-09, #8)", () => {
  it("doubles from 4 to 8 servings and quarters from 4 to 1", () => {
    expect(scaleQuantity(250, 4, 8)).toBe(500);
    expect(scaleQuantity(2, 4, 1)).toBe(0.5);
  });

  it("leaves the amount alone at the recipe's own servings", () => {
    expect(scaleQuantity(1.5, 4, 4)).toBe(1.5);
  });

  it("multiplies before dividing and never rounds (rounding is for display only)", () => {
    expect(scaleQuantity(1, 3, 1)).toBe(1 / 3);
    expect(formatQuantity(scaleQuantity(1, 3, 1))).toBe("0.33");
    // The same arithmetic, in the same order, as the grocery list always used.
    expect(scaleQuantity(0.1, 3, 7)).toBe((0.1 * 7) / 3);
  });
});
