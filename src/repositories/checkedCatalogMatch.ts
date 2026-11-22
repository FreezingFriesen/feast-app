// The catalog's match for one recipe row, checked like any data from outside the app.
// Shared by the grocery list (N-08) and the recipe filter (#10, N-04), so the two can never
// disagree about which ingredient a row is.
//
// Fails closed. A match that fails catalogMatchSchema, a find() that throws, or a result
// that isn't an object all read as "no match": for amounts that means "can't combine", for
// allergens it means "couldn't check", never "no allergens".
import { catalogMatchSchema } from "@/validation/ingredientSchema";
import type { CatalogMatch, IngredientCatalog } from "./IngredientCatalog";

// Checked results for frozen matches, or null for a frozen match that failed the check.
// buildIngredientCatalog hands out the same frozen object for an ingredient every time,
// and a frozen object can't change, so each ingredient is checked once per catalog
// snapshot instead of once per recipe row (the recipe filter looks up thousands of rows).
// A WeakMap, so the entries go when the snapshot does.
const checkedMatches = new WeakMap<object, CatalogMatch | null>();

// True if the match and its lists can't change. Matches that aren't frozen (e.g. a test
// fake's plain objects) are checked on every lookup.
function isFrozenMatch(found: object): boolean {
  if (!Object.isFrozen(found)) return false;
  const { allergens, dietTags } = found as { allergens?: unknown; dietTags?: unknown };
  return [allergens, dietTags].every(
    (list) => list === undefined || (typeof list === "object" && list !== null && Object.isFrozen(list)),
  );
}

// The checked copy of a match, frozen so nobody who receives it can change it, or
// undefined if it fails the check.
function check(found: unknown): CatalogMatch | undefined {
  const parsed = catalogMatchSchema.safeParse(found);
  if (!parsed.success) return undefined;
  const { allergens, dietTags, ...rest } = parsed.data;
  return Object.freeze({
    ...rest,
    ...(allergens !== undefined ? { allergens: Object.freeze([...allergens]) } : {}),
    ...(dietTags !== undefined ? { dietTags: Object.freeze([...dietTags]) } : {}),
  });
}

// The ingredient a recipe row is, or undefined if the catalog has no valid match for it.
export function findCheckedMatch(
  catalog: IngredientCatalog,
  row: { ingredientId?: string; name: string },
): CatalogMatch | undefined {
  try {
    const found: unknown = catalog.find({ ingredientId: row.ingredientId, name: row.name });
    if (found === undefined) return undefined;
    // Object.isFrozen is true for primitives, and they can't be WeakMap keys.
    if (typeof found !== "object" || found === null) return check(found);
    // Only frozen matches are ever cached, and frozen stays frozen, so a hit needs no
    // second look (this is the path tens of thousands of rows take).
    const cached = checkedMatches.get(found);
    if (cached !== undefined) return cached ?? undefined;
    if (!isFrozenMatch(found)) return check(found);
    const checked = check(found);
    checkedMatches.set(found, checked ?? null);
    return checked;
  } catch {
    return undefined;
  }
}
