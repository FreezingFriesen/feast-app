// Units for the grocery list (N-07, N-08): which family each unit belongs to, how units
// convert, and which unit a merged line shows. Pure functions, no React or storage.
import type { UNITS } from "@/validation/recipeSchema";

export type Unit = (typeof UNITS)[number];

// Units only add up within a family. Each family has a base unit that sums are made in:
// grams, millilitres, pieces and pinches.
export type UnitFamily = "mass" | "volume" | "piece" | "pinch";

// Every conversion constant, in one place.
// Mass is exact: the international pound is defined as 0.45359237 kg (1959), and an
// ounce is 1/16 of it.
export const GRAMS_PER_KG = 1000;
export const GRAMS_PER_LB = 453.59237;
export const GRAMS_PER_OZ = 28.349523125;
// Volume uses the Canadian metric measures (the team's choice): a 250 ml cup, 15 ml
// tablespoon and 5 ml teaspoon. Ingredient data's gramsPerCup must use the same cup.
export const ML_PER_L = 1000;
export const ML_PER_CUP = 250;
export const ML_PER_TBSP = 15;
export const ML_PER_TSP = 5;

// The family of each unit, and how many base units one of it is.
const UNIT_INFO: Readonly<Record<Unit, { family: UnitFamily; toBase: number }>> = Object.freeze({
  g: { family: "mass", toBase: 1 },
  kg: { family: "mass", toBase: GRAMS_PER_KG },
  oz: { family: "mass", toBase: GRAMS_PER_OZ },
  lb: { family: "mass", toBase: GRAMS_PER_LB },
  ml: { family: "volume", toBase: 1 },
  l: { family: "volume", toBase: ML_PER_L },
  tsp: { family: "volume", toBase: ML_PER_TSP },
  tbsp: { family: "volume", toBase: ML_PER_TBSP },
  cup: { family: "volume", toBase: ML_PER_CUP },
  piece: { family: "piece", toBase: 1 },
  pinch: { family: "pinch", toBase: 1 },
});

// A merged line in mixed units shows this unit, switching to the large one at 1000.
const METRIC_UNITS: Readonly<Record<UnitFamily, { small: Unit; large?: Unit }>> = Object.freeze({
  mass: { small: "g", large: "kg" },
  volume: { small: "ml", large: "l" },
  piece: { small: "piece" },
  pinch: { small: "pinch" },
});

// The point where g becomes kg and ml becomes l.
const LARGE_UNIT_FROM = 1000;

export function unitFamily(unit: Unit): UnitFamily {
  return UNIT_INFO[unit].family;
}

// An amount in its family's base unit (g, ml, piece or pinch).
export function toBase(quantity: number, unit: Unit): number {
  return quantity * UNIT_INFO[unit].toBase;
}

// A base-unit amount in another unit of the same family.
export function fromBase(base: number, unit: Unit): number {
  return base / UNIT_INFO[unit].toBase;
}

// An amount in another unit of the same family, or undefined across families (those
// need ingredient data: see baseToGrams).
export function convertWithinFamily(quantity: number, from: Unit, to: Unit): number | undefined {
  if (from === to) return quantity;
  if (unitFamily(from) !== unitFamily(to)) return undefined;
  return fromBase(toBase(quantity, from), to);
}

// What an ingredient weighs: grams per (250 ml) cup and per piece. Either may be unknown.
export type Density = { gramsPerCup?: number; gramsPerPiece?: number };

// A base-unit amount as grams, or undefined when it can't be converted. Volume needs
// gramsPerCup (ml / 250 x gramsPerCup), piece needs gramsPerPiece, and a pinch never
// converts. Never a guess: missing data means "can't convert".
export function baseToGrams(base: number, family: UnitFamily, density: Density): number | undefined {
  switch (family) {
    case "mass":
      return base;
    case "volume":
      return density.gramsPerCup === undefined ? undefined : (base * density.gramsPerCup) / ML_PER_CUP;
    case "piece":
      return density.gramsPerPiece === undefined ? undefined : base * density.gramsPerPiece;
    case "pinch":
      return undefined;
  }
}

// A value rounded the way formatQuantity shows it (2 decimal places). Only used to pick
// the unit, so 999.996 g shows as "1 kg" rather than "1000 g".
const roundedForDisplay = (value: number) => Math.round(value * 100) / 100;

// The unit a line in mixed units shows, and its amount in that unit: g or ml, or kg or l
// from 1000 up. Pieces and pinches keep their unit.
export function metricDisplay(base: number, family: UnitFamily): { quantity: number; unit: Unit } {
  const { small, large } = METRIC_UNITS[family];
  if (large !== undefined && roundedForDisplay(base) >= LARGE_UNIT_FROM) {
    return { quantity: fromBase(base, large), unit: large };
  }
  return { quantity: fromBase(base, small), unit: small };
}
