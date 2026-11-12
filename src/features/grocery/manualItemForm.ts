// The "Add item" form's state and how it becomes input for manualGroceryItemSchema.
// Values are kept as typed; no validation happens here (the schema does it).
import { MAX_GROCERY_QUANTITY } from "@/validation/groceryItemSchema";
import type { Unit } from "./units";

// unit is "" until a unit chip is picked.
export type ManualItemFormValues = {
  name: string;
  quantity: string;
  unit: Unit | "";
};

// The quantity box's maxLength: the largest quantity's digits ("100000" is 6), a decimal
// point and 2 decimal places.
export const QUANTITY_INPUT_MAX_LENGTH = String(MAX_GROCERY_QUANTITY).length + 3;

export function emptyManualItemForm(): ManualItemFormValues {
  return { name: "", quantity: "", unit: "" };
}

// Turns the typed form into the shape manualGroceryItemSchema checks. A blank amount or
// unit is left out; otherwise the amount is converted with an explicit Number(), so "abc"
// becomes NaN, which the schema rejects.
export function toManualItemInput(values: ManualItemFormValues): unknown {
  const quantity = values.quantity.trim();
  return {
    name: values.name,
    quantity: quantity === "" ? undefined : Number(quantity),
    unit: values.unit === "" ? undefined : values.unit,
  };
}
