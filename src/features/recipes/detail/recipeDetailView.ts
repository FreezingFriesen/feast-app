// What the recipe detail screen shows (N-01 view, #8 serving scaler). Pure, so every
// state is unit-tested without rendering (__tests__/recipeDetailView.test.ts).
//
// Wording rules (health risk), the same as the recipe list: nothing here ever says
// "safe", "allergen-free" or "OK for you", and no allergen state is green or ticked. The
// absence of a warning is the only positive signal, and the screen says when the data
// behind it is incomplete.
import { formatOptionLabel } from "@/components/form/formatOptionLabel";
import { formatAmount, spokenAmount } from "@/features/grocery/formatQuantity";
import type { IngredientCatalogStatus } from "@/repositories/IngredientCatalogStore";
import type { Recipe } from "@/repositories/RecipeRepository";
import { recipeServingsSchema } from "@/validation/recipeSchema";
import type { AllergenAssessment } from "../filter/allergenAssessment";
import { conflictingDiets } from "../filter/dietConflicts";
import type { ProfileFilterSource } from "../filter/recipeFilter";
import {
  CATALOG_EMPTY_NOTICE,
  conflictText,
  containsText,
  uncheckedText,
  UNREVIEWED_NOTICE,
  type RecipeRowView,
} from "../filter/recipeListState";
import { formatServings } from "../formatServings";
import { formatMinutes, totalMinutes } from "../recipeTime";
import { scaleQuantity } from "../scaleQuantity";

// Shown in the stat strip when the recipe has no prep or cook time.
export const NO_TIME = "—";

export type RecipeDetailNote = RecipeRowView["notes"][number];

export type RecipeDetailStat = {
  label: string;
  value: string;
  // What a screen reader says for the whole column, e.g. "Total time: 15 min".
  spoken: string;
};

export type RecipeDetailIngredient = {
  key: string;
  name: string;
  // Scaled to the servings shown, e.g. "500 g".
  amount: string;
  // The same for a screen reader, e.g. "500 grams".
  spokenAmount: string;
  note: string | null;
};

export type RecipeDetailView = {
  title: string;
  // "Lunch, Dinner / 15 min", either part alone, or null if the recipe has neither.
  subtitle: string | null;
  // Total time, Ingredients, Servings (in that order).
  stats: RecipeDetailStat[];
  servings: number;
  // "4 servings", announced when the stepper changes it.
  servingsText: string;
  canDecrease: boolean;
  canIncrease: boolean;
  notes: RecipeDetailNote[];
  dataNotice: string | null;
  ingredients: RecipeDetailIngredient[];
  description: string | null;
  steps: string[];
  dietTags: string[];
  recipeNotes: string | null;
};

export type RecipeDetailInput = {
  recipe: Recipe;
  // The servings the stepper shows (starts at recipe.servings; never saved).
  displayedServings: number;
  // The recipe's allergens from the ingredient catalog, or null while it's still loading.
  assessment: AllergenAssessment | null;
  profile: ProfileFilterSource;
  catalogStatus: IngredientCatalogStatus;
};

// The next servings value after pressing − (delta −1) or + (delta +1). Each change is
// checked with the recipe's own servings rule; a value it refuses keeps the last valid one.
export function stepServings(current: number, delta: -1 | 1): number {
  const next = current + delta;
  return recipeServingsSchema.safeParse(next).success ? next : current;
}

// Whether − or + would change anything (the buttons are disabled at the limits).
export function canStep(current: number, delta: -1 | 1): boolean {
  return recipeServingsSchema.safeParse(current + delta).success;
}

function subtitleFor(recipe: Recipe): string | null {
  const mealTypes = recipe.mealTypes.map(formatOptionLabel).join(", ");
  const minutes = totalMinutes(recipe);
  const time = minutes === null ? "" : formatMinutes(minutes);
  const parts = [mealTypes, time].filter((part) => part !== "");
  return parts.length > 0 ? parts.join(" / ") : null;
}

function statsFor(recipe: Recipe, servings: number): RecipeDetailStat[] {
  const minutes = totalMinutes(recipe);
  const time = minutes === null ? NO_TIME : formatMinutes(minutes);
  const count = String(recipe.ingredients.length);
  return [
    { label: "Total time", value: time, spoken: `Total time: ${minutes === null ? "not set" : time}` },
    { label: "Ingredients", value: count, spoken: `Ingredients: ${count}` },
    { label: "Servings", value: String(servings), spoken: `Servings: ${servings}` },
  ];
}

// The allergen and diet notes, and the data notice. Nothing while the profile or the
// ingredient catalog is still loading: no notes rather than a guess.
function notesFor({ recipe, assessment, profile, catalogStatus }: RecipeDetailInput): {
  notes: RecipeDetailNote[];
  dataNotice: string | null;
} {
  if (profile.status === "loading" || catalogStatus === "loading" || assessment === null) {
    return { notes: [], dataNotice: null };
  }
  const userAllergens = profile.status === "ready" ? (profile.restrictions?.allergens ?? []) : [];
  const notes: RecipeDetailNote[] = [];

  // The user's allergens this recipe contains. Shown here whether or not the list's
  // allergy & diet filter is on.
  const contains = assessment.contains.filter((allergen) => userAllergens.includes(allergen));
  if (contains.length > 0) notes.push({ kind: "contains", text: containsText(contains) });
  // Any of the recipe's own diet tags its allergens contradict, whoever is looking.
  for (const conflict of conflictingDiets(recipe.dietTags, assessment.contains)) {
    notes.push({ kind: "conflict", text: conflictText(conflict.diet, conflict.allergens) });
  }
  // Rows that couldn't be checked matter to anyone avoiding an allergen.
  if (userAllergens.length > 0 && assessment.unmatchedNames.length > 0) {
    notes.push({ kind: "unchecked", text: uncheckedText(assessment.unmatchedNames) });
  }

  // For anyone avoiding an allergen, say when the data behind these notes is incomplete
  // (the same notices as the list).
  let dataNotice: string | null = null;
  if (userAllergens.length > 0) {
    if (catalogStatus === "empty") dataNotice = CATALOG_EMPTY_NOTICE;
    else if (assessment.usesUnreviewedData) dataNotice = UNREVIEWED_NOTICE;
  }
  return { notes, dataNotice };
}

export function buildRecipeDetailView(input: RecipeDetailInput): RecipeDetailView {
  const { recipe } = input;
  // Never show servings outside the rule, even if the caller passes one.
  const servings = recipeServingsSchema.safeParse(input.displayedServings).success
    ? input.displayedServings
    : recipe.servings;
  const { notes, dataNotice } = notesFor(input);

  return {
    title: recipe.title,
    subtitle: subtitleFor(recipe),
    stats: statsFor(recipe, servings),
    servings,
    servingsText: formatServings(servings),
    canDecrease: canStep(servings, -1),
    canIncrease: canStep(servings, 1),
    notes,
    dataNotice,
    ingredients: recipe.ingredients.map((row, index) => {
      const quantity = scaleQuantity(row.quantity, recipe.servings, servings);
      return {
        // Rows can share a name, so the position keeps keys unique.
        key: `${index}:${row.name}`,
        name: row.name,
        amount: formatAmount(quantity, row.unit),
        spokenAmount: spokenAmount(quantity, row.unit),
        note: row.note && row.note !== "" ? row.note : null,
      };
    }),
    description: recipe.description && recipe.description !== "" ? recipe.description : null,
    steps: [...recipe.steps],
    dietTags: recipe.dietTags.map(formatOptionLabel),
    recipeNotes: recipe.notes && recipe.notes !== "" ? recipe.notes : null,
  };
}
