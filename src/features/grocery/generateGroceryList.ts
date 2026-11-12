// The weekly grocery list (#6): every ingredient of the week's planned meals, scaled to
// each meal's servings (N-09), with the same ingredient merged into one line (N-07) and
// units combined only when that is safe (N-08). Worked out from the meal plan every time,
// never stored. Pure: no React, no storage, no network.
import type { CatalogMatch, IngredientCatalog } from "@/repositories/IngredientCatalog";
import type { MealPlanEntry } from "@/repositories/MealPlanRepository";
import type { Recipe } from "@/repositories/RecipeRepository";
import { cleanText } from "@/validation/clean";
import { catalogMatchSchema } from "@/validation/ingredientSchema";
import { ID_PATTERN } from "@/validation/patterns";
import { baseToGrams, metricDisplay, toBase, unitFamily, type Density, type Unit, type UnitFamily } from "./units";

// Only the fields the list needs, so tests can pass plain objects.
export type PlannedMeal = Pick<MealPlanEntry, "recipeId" | "servings">;
export type RecipeForList = Pick<Recipe, "servings" | "ingredients" | "deletedAt">;

// One line of the list.
export type GroceryLine = {
  // Which line this is: the ingredient's group key and the unit family, e.g.
  // "name:flour|mass". It doesn't change when the amount changes, so a check mark stays.
  key: string;
  // As written in the first recipe row that contributed to the line.
  name: string;
  // The total, at full precision. Round it only for display (formatQuantity).
  quantity: number;
  unit: Unit;
  // "mass" for a line that combined several families through conversion data.
  family: UnitFamily;
  // True when the same ingredient is also on another line, in a unit that couldn't be
  // converted. The screen says so instead of showing a guessed total.
  uncombined: boolean;
};

export type GroceryList = {
  lines: GroceryLine[];
  // Planned meals whose recipe is missing or deleted. They add nothing to the list, and
  // the screen tells the user how many were left out.
  skippedEntries: number;
};

type GroceryListInput = {
  entries: readonly PlannedMeal[];
  recipesById: ReadonlyMap<string, RecipeForList>;
  catalog: IngredientCatalog;
};

// One unit family's running total for one ingredient. `unit` is the unit every row so far
// has used, or null once two different units were seen.
type FamilyTotal = { base: number; unit: Unit | null; sameUnitTotal: number };

// Everything collected for one ingredient.
type Group = { name: string; density: Density; families: Map<UnitFamily, FamilyTotal> };

// Lines for one ingredient come out in this order.
const FAMILY_ORDER: readonly UnitFamily[] = ["mass", "volume", "piece", "pinch"];

// Lines are sorted by name, ignoring case and accents ("Flour" next to "flour").
const byName = new Intl.Collator("en", { sensitivity: "base" });

// A name as a merge key: cleaned, lower-cased, runs of spaces made one. No guessing about
// plurals: "Egg" and "Eggs" stay apart until the catalog matches them, because a wrong
// merge is worse than a missed one.
export function normaliseName(name: string): string {
  return cleanText(name).toLowerCase().replace(/\s+/g, " ");
}

// The catalog's match for a row, checked like any data from outside the app. A match that
// fails the check is ignored, so a bad density can never produce a wrong amount.
function findMatch(catalog: IngredientCatalog, row: { ingredientId?: string; name: string }): CatalogMatch | undefined {
  const found = catalog.find({ ingredientId: row.ingredientId, name: row.name });
  if (found === undefined) return undefined;
  const parsed = catalogMatchSchema.safeParse(found);
  return parsed.success ? parsed.data : undefined;
}

// Which rows count as the same ingredient: the catalog's ID, else the row's own
// ingredientId, else its name. The prefixes keep a name from ever matching an ID. An
// ingredientId that isn't a valid ID (recipes don't enforce the pattern) is ignored.
function groupKeyFor(row: { ingredientId?: string; name: string }, match: CatalogMatch | undefined): string {
  if (match !== undefined) return `id:${match.id}`;
  if (row.ingredientId !== undefined && ID_PATTERN.test(row.ingredientId)) return `id:${row.ingredientId}`;
  return `name:${normaliseName(row.name)}`;
}

// Adds one row's scaled amount to its ingredient's total for that unit family.
function addAmount(group: Group, amount: number, unit: Unit) {
  const family = unitFamily(unit);
  let total = group.families.get(family);
  if (total === undefined) {
    total = { base: 0, unit, sameUnitTotal: 0 };
    group.families.set(family, total);
  }
  total.base += toBase(amount, unit);
  if (total.unit === unit) {
    total.sameUnitTotal += amount;
  } else {
    total.unit = null;
  }
}

// What one family's total shows: its own unit if every row used it (summed in that unit,
// so 2 lb + 1 lb is exactly 3 lb), otherwise g or ml (kg or l from 1000).
function familyDisplay(total: FamilyTotal, family: UnitFamily): { quantity: number; unit: Unit } {
  return total.unit === null ? metricDisplay(total.base, family) : { quantity: total.sameUnitTotal, unit: total.unit };
}

// The lines for one ingredient. Families that can become grams (mass always, volume with
// gramsPerCup, pieces with gramsPerPiece; never a pinch) are combined into one mass line
// when there are at least two of them. Every other family keeps its own line. When an
// ingredient ends up on more than one line, each one is marked uncombined.
function linesFor(groupKey: string, group: Group): GroceryLine[] {
  const families = FAMILY_ORDER.flatMap((family) => {
    const total = group.families.get(family);
    return total === undefined ? [] : [{ family, total, grams: baseToGrams(total.base, family, group.density) }];
  });
  const convertible = families.filter((item) => item.grams !== undefined);
  const combine = convertible.length >= 2;

  const shown: { family: UnitFamily; quantity: number; unit: Unit }[] = [];
  if (combine) {
    const grams = convertible.reduce((sum, item) => sum + (item.grams ?? 0), 0);
    shown.push({ family: "mass", ...metricDisplay(grams, "mass") });
  }
  for (const item of families) {
    if (combine && item.grams !== undefined) continue;
    shown.push({ family: item.family, ...familyDisplay(item.total, item.family) });
  }

  const uncombined = shown.length > 1;
  return shown.map((line) => ({
    key: `${groupKey}|${line.family}`,
    name: group.name,
    quantity: line.quantity,
    unit: line.unit,
    family: line.family,
    uncombined,
  }));
}

// Builds the list for the given planned meals.
export function generateGroceryList({ entries, recipesById, catalog }: GroceryListInput): GroceryList {
  const groups = new Map<string, Group>();
  let skippedEntries = 0;

  for (const entry of entries) {
    const recipe = recipesById.get(entry.recipeId);
    if (recipe === undefined || recipe.deletedAt !== undefined) {
      skippedEntries += 1;
      continue;
    }
    for (const row of recipe.ingredients) {
      // Multiply before dividing, and never round: rounding happens only for display.
      const amount = (row.quantity * entry.servings) / recipe.servings;
      const match = findMatch(catalog, row);
      const key = groupKeyFor(row, match);
      let group = groups.get(key);
      if (group === undefined) {
        group = { name: row.name, density: {}, families: new Map() };
        groups.set(key, group);
      }
      // Every match in a group is the same ingredient (the key is its ID), so any match's
      // conversion data is the group's.
      if (match !== undefined) {
        group.density = { gramsPerCup: match.gramsPerCup, gramsPerPiece: match.gramsPerPiece };
      }
      addAmount(group, amount, row.unit);
    }
  }

  const lines = [...groups].flatMap(([key, group]) => linesFor(key, group));
  lines.sort((a, b) => byName.compare(a.name, b.name) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { lines, skippedEntries };
}
