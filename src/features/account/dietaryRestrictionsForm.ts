import { formatOptionLabel } from "@/components/form/ChipSelect";
import type { DietaryRestrictions } from "@/repositories/ProfileRepository";
import type { ALLERGENS, DIET_TAGS } from "@/validation/recipeSchema";

// One allergen (e.g. "peanuts") and one diet (e.g. "vegan"), from the shared lists.
export type Allergen = (typeof ALLERGENS)[number];
export type DietTag = (typeof DIET_TAGS)[number];

// Chip selections as picked on screen. No validation happens here:
// dietaryRestrictionsSchema checks them on save (form and repository).
export type DietaryFormValues = { allergens: Allergen[]; diets: DietTag[] };

// The saved choices as chip selections. "Not set yet" starts with nothing picked.
// The lists are copied so changing the chips never changes the saved profile.
export function toDietaryFormValues(current: DietaryRestrictions | null): DietaryFormValues {
  return { allergens: [...(current?.allergens ?? [])], diets: [...(current?.diets ?? [])] };
}

// Picks a chip if it isn't picked, or unpicks it if it is.
export function toggleChoice<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

// True if both lists hold the same values, in any order.
const sameChoices = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((value) => b.includes(value));

// "Not set yet" can always be saved, even with nothing picked: that records "none".
export function canSave(current: DietaryRestrictions | null, values: DietaryFormValues): boolean {
  if (current === null) return true;
  return !sameChoices(current.allergens, values.allergens) || !sameChoices(current.diets, values.diets);
}

// The save button's text. "I don't have any" when nothing is set yet and nothing is picked.
export function saveLabel(current: DietaryRestrictions | null, values: DietaryFormValues): string {
  const nothingPicked = values.allergens.length === 0 && values.diets.length === 0;
  return current === null && nothingPicked ? "I don't have any" : "Save";
}

// One line for the summary: "Not set yet", "None", or "Peanuts, Milk, Vegan".
export function describeRestrictions(current: DietaryRestrictions | null): string {
  if (current === null) return "Not set yet";
  const labels = [...current.allergens, ...current.diets].map(formatOptionLabel);
  return labels.length === 0 ? "None" : labels.join(", ");
}
