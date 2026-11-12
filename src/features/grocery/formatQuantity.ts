// How grocery amounts are shown: rounded only here, never in the totals.
import type { Unit } from "./units";

// Shown for a positive amount too small to show with 2 decimal places. A positive amount
// never shows as 0.
export const BELOW_SMALLEST = "< 0.01";
// Shown for a value that can't be an amount (not a number, or negative). The list never
// produces one (its inputs are validated); this is a guard, not a guess.
export const NOT_AN_AMOUNT = "—";

// From here up, toFixed switches to exponent notation ("1e+21"), so whole numbers this big
// (every double this big is one) are written out through BigInt instead.
const EXPONENT_FROM = 1e21;

// The unit as shown after the number. Only the word units change for more than one.
const UNIT_LABELS: Readonly<Record<Unit, { one: string; many: string }>> = Object.freeze({
  g: { one: "g", many: "g" },
  kg: { one: "kg", many: "kg" },
  ml: { one: "ml", many: "ml" },
  l: { one: "l", many: "l" },
  tsp: { one: "tsp", many: "tsp" },
  tbsp: { one: "tbsp", many: "tbsp" },
  cup: { one: "cup", many: "cups" },
  oz: { one: "oz", many: "oz" },
  lb: { one: "lb", many: "lb" },
  piece: { one: "piece", many: "pieces" },
  pinch: { one: "pinch", many: "pinches" },
});

// The unit as a screen reader should say it ("g" is read as a letter otherwise).
const SPOKEN_UNITS: Readonly<Record<Unit, { one: string; many: string }>> = Object.freeze({
  g: { one: "gram", many: "grams" },
  kg: { one: "kilogram", many: "kilograms" },
  ml: { one: "millilitre", many: "millilitres" },
  l: { one: "litre", many: "litres" },
  tsp: { one: "teaspoon", many: "teaspoons" },
  tbsp: { one: "tablespoon", many: "tablespoons" },
  cup: { one: "cup", many: "cups" },
  oz: { one: "ounce", many: "ounces" },
  lb: { one: "pound", many: "pounds" },
  piece: { one: "piece", many: "pieces" },
  pinch: { one: "pinch", many: "pinches" },
});

// Rounded to 2 decimal places, the way it is shown.
const rounded = (quantity: number) => Math.round(quantity * 100) / 100;

// A quantity for display: at most 2 decimal places, trailing zeros dropped ("2.5", "3"),
// "< 0.01" for a positive amount that would round to 0, and never exponent notation.
export function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity) || quantity < 0) return NOT_AN_AMOUNT;
  if (quantity >= EXPONENT_FROM) return BigInt(Math.round(quantity)).toString();
  const value = rounded(quantity);
  if (value === 0) return quantity > 0 ? BELOW_SMALLEST : "0";
  const [whole, fraction] = value.toFixed(2).split(".");
  const kept = fraction.replace(/0+$/, "");
  return kept === "" ? whole : `${whole}.${kept}`;
}

// "3 cups", "1 cup", "0.5 cup", "500 g". Word units are plural when the amount shown is
// more than 1 (recipe style: "1/2 cup").
export function formatAmount(quantity: number, unit: Unit): string {
  const label = rounded(quantity) > 1 ? UNIT_LABELS[unit].many : UNIT_LABELS[unit].one;
  return `${formatQuantity(quantity)} ${label}`;
}

// The same amount for a screen reader: "500 grams", "1 cup", "less than 0.01 pinches".
// Singular only for exactly 1, as spoken English has it ("0.5 grams").
export function spokenAmount(quantity: number, unit: Unit): string {
  const shown = formatQuantity(quantity);
  const words = shown === "1" ? SPOKEN_UNITS[unit].one : SPOKEN_UNITS[unit].many;
  const number = shown === BELOW_SMALLEST ? "less than 0.01" : shown;
  return `${number} ${words}`;
}
