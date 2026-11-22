// Checks shared by the in-memory and SQLite IngredientRepository, so both accept and
// refuse exactly the same things.
import { domainError } from "@/services/domainErrors";
import { timestampSchema } from "@/validation/authSchema";
import { storedIngredientSchema, type Ingredient } from "@/validation/ingredientSchema";
import { MAX_INGREDIENT_JSON_LENGTH, MAX_INGREDIENTS } from "./IngredientRepository";
import { isRecordId, withoutUndefined } from "./records";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// The ingredient list and timestamp for replaceAll, checked again here because the
// repository check is the one that counts. Returns the parsed (cleaned) ingredients, which
// are what gets stored. Anything wrong refuses the whole replacement, so a bad list can
// never replace a good copy.
export function prepareReplacement(ingredients: unknown, fetchedAt: unknown): { rows: Ingredient[]; fetchedAt: number } {
  const time = timestampSchema.safeParse(fetchedAt);
  if (!time.success || !Array.isArray(ingredients) || ingredients.length === 0 || ingredients.length > MAX_INGREDIENTS) {
    throw domainError("invalid_input");
  }
  const seen = new Set<string>();
  const rows = ingredients.map((ingredient: unknown) => {
    const parsed = storedIngredientSchema.safeParse(ingredient);
    if (!parsed.success || seen.has(parsed.data.id)) throw domainError("invalid_input");
    seen.add(parsed.data.id);
    return withoutUndefined(parsed.data);
  });
  return { rows, fetchedAt: time.data };
}

// What is stored for one ingredient: its fields without the id (the id is its own column
// or key, like the Firestore document name).
export function ingredientData(ingredient: Ingredient): string {
  const data: Record<string, unknown> = { ...ingredient };
  delete data.id;
  return JSON.stringify(data);
}

// One stored ingredient, read back. Untrusted, like anything read from storage: a bad id,
// over-long or broken JSON, or anything that fails the schema reads as missing. The id is
// set last, so stored data can't claim a different one.
export function readStoredIngredient(id: unknown, data: unknown): Ingredient | undefined {
  if (!isRecordId(id) || typeof data !== "string" || data.length > MAX_INGREDIENT_JSON_LENGTH) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (!isPlainObject(parsed)) return undefined;
  const result = storedIngredientSchema.safeParse({ ...parsed, id });
  return result.success ? withoutUndefined(result.data) : undefined;
}
