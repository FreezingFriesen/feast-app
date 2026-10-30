// src/validation/ingredientSchema.ts
// One ingredient from Edwin's dataset (ingredients/{id} in Firestore), checked by
// scripts/importIngredients.ts before it is saved. Limits follow the Feast Database
// Guide, section 8. Fields are the CSV columns in camelCase (package_price -> packagePrice).
// Nutrition values are per 100 g.
import { z } from "zod";
import { cleanText } from "./clean";
import { dateKeySchema } from "./mealPlanSchema";
import { ID_PATTERN, NAME_PATTERN } from "./patterns";
import { ALLERGENS, DIET_TAGS } from "./recipeSchema";

export const INGREDIENT_CATEGORIES = [
  "produce",
  "dairy_eggs",
  "canned",
  "meat_fish",
  "spices",
  "oils_sauces",
  "pantry",
  "frozen",
  "bakery",
] as const;

// Units a store package is sold in. "each" = sold by the piece.
export const PACKAGE_UNITS = ["g", "kg", "ml", "l", "lb", "each"] as const;
export const CURRENCIES = ["CAD"] as const;
export const REGIONS = ["Alberta"] as const;

export const MIN_PRICE_DATE = "2020-01-01";
// Sugar plus fibre may be above carbs by this much before it is reported (rounding).
export const CARB_SLACK_G = 1.5;

const name = (max: number) =>
  z.string().transform(cleanText).pipe(z.string().min(1).max(max).regex(NAME_PATTERN));

const freeText = (max: number) =>
  z.string().transform(cleanText).pipe(z.string().min(1).max(max));

const amount = (max: number) => z.number().min(0).max(max);
const positive = (max: number) => z.number().positive().max(max);

// Today as "YYYY-MM-DD", for "not in the future".
const todayKey = () => new Date().toISOString().slice(0, 10);

export const ingredientSchema = z
  .object({
    // Identity. id becomes the document ID (ingredients/all_purpose_flour), not a field.
    id: z.string().max(100).regex(ID_PATTERN),
    name: name(100),
    aliases: z.array(name(50)).max(10).default([]),
    category: z.enum(INGREDIENT_CATEGORIES),

    // Unit conversion (N-08). Often blank: the app must say "can't convert", never guess.
    gramsPerCup: positive(1000).optional(),
    gramsPerPiece: positive(5000).optional(),
    pieceDescription: freeText(100).optional(),

    // Price (N-06)
    packagePrice: positive(10_000).refine(
      (price) => Math.abs(price * 100 - Math.round(price * 100)) < 1e-9,
      "At most 2 decimal places",
    ),
    packageSize: positive(100_000),
    packageUnit: z.enum(PACKAGE_UNITS),
    priceSource: name(50),
    priceCollectedAt: dateKeySchema
      .refine((date) => date >= MIN_PRICE_DATE, "Before 2020")
      .refine((date) => date <= todayKey(), "In the future"),
    currency: z.enum(CURRENCIES),
    region: z.enum(REGIONS),

    // Nutrition per 100 g (N-12)
    caloriesPer100g: amount(900),
    proteinG: amount(100),
    carbsG: amount(100),
    fatG: amount(100),
    saturatedFatG: amount(100),
    fiberG: amount(100),
    sugarG: amount(100),
    sodiumMg: amount(40_000),
    nutritionSource: name(100),

    // Safety tags (N-03, N-04). Lists shared with recipes and profiles.
    allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).default([]),
    // false = nobody has checked the allergens against the label yet, so the app must
    // show "allergens unknown", never "safe". true + empty list = checked, none.
    allergensReviewed: z.boolean(),
    // A missing tag means "not confirmed", never "confirmed no".
    dietTags: z.array(z.enum(DIET_TAGS)).max(DIET_TAGS.length).default([]),

    // Housekeeping
    lastUpdated: dateKeySchema,
    notes: freeText(500).optional(),
  })
  .refine((i) => i.proteinG + i.carbsG + i.fatG <= 100, {
    path: ["fatG"],
    message: "Protein, carbs and fat add up to more than 100 g",
  })
  .refine((i) => i.saturatedFatG <= i.fatG, {
    path: ["saturatedFatG"],
    message: "More saturated fat than total fat",
  })
  .refine((i) => i.gramsPerPiece === undefined || i.pieceDescription !== undefined, {
    path: ["pieceDescription"],
    message: "Required when gramsPerPiece is set",
  })
  .refine((i) => new Set(i.allergens).size === i.allergens.length, {
    path: ["allergens"],
    message: "Duplicate allergen",
  })
  .refine((i) => new Set(i.dietTags).size === i.dietTags.length, {
    path: ["dietTags"],
    message: "Duplicate diet tag",
  });

export type Ingredient = z.output<typeof ingredientSchema>;

// Things that look wrong but are still saved (guide section 9, item 7).
export function ingredientWarnings(ingredient: Ingredient): string[] {
  const warnings: string[] = [];
  const over = ingredient.sugarG + ingredient.fiberG - ingredient.carbsG;
  if (over > CARB_SLACK_G) {
    warnings.push(`sugar + fibre is ${over.toFixed(1)} g above carbs`);
  }
  return warnings;
}
