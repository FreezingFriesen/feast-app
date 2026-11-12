import { manualGroceryItemSchema } from "@/validation/groceryItemSchema";
import { emptyManualItemForm, QUANTITY_INPUT_MAX_LENGTH, toManualItemInput } from "../manualItemForm";

describe("manual item form", () => {
  it("starts empty", () => {
    expect(emptyManualItemForm()).toEqual({ name: "", quantity: "", unit: "" });
  });

  it("leaves a blank amount and unit out", () => {
    expect(toManualItemInput({ name: "Paper towels", quantity: "  ", unit: "" })).toEqual({
      name: "Paper towels",
      quantity: undefined,
      unit: undefined,
    });
  });

  it("converts the amount with Number()", () => {
    expect(toManualItemInput({ name: "Milk", quantity: " 2.5 ", unit: "l" })).toEqual({
      name: "Milk",
      quantity: 2.5,
      unit: "l",
    });
  });

  it("turns text that isn't a number into NaN, which the schema rejects", () => {
    const input = toManualItemInput({ name: "Milk", quantity: "abc", unit: "l" });
    expect(input).toMatchObject({ quantity: Number.NaN });
    expect(manualGroceryItemSchema.safeParse(input).success).toBe(false);
  });

  it("lets the quantity box hold the largest amount with 2 decimals", () => {
    expect(QUANTITY_INPUT_MAX_LENGTH).toBe("100000.00".length);
  });
});
