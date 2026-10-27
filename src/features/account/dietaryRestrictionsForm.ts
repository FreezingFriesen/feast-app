import { formatOptionLabel } from "@/components/form/ChipSelect";
import type { DietaryRestrictions } from "@/repositories/ProfileRepository";
import type { ALLERGENS, DIET_TAGS } from "@/validation/recipeSchema";

export type Allergen = (typeof ALLERGENS)[number];
export type DietTag = (typeof DIET_TAGS)[number];

// Chip selections as picked on screen. No validation happens here:
// dietaryRestrictionsSchema checks them on save (form and repository).
export type DietaryFormValues = { allergens: Allergen[]; diets: DietTag[] };

export function toDietaryFormValues(current: DietaryRestrictions | null): DietaryFormValues {
  return { allergens: [...(current?.allergens ?? [])], diets: [...(current?.diets ?? [])] };
}

export function toggleChoice<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const sameChoices = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((value) => b.includes(value));

// "Not set yet" can always be saved, even with nothing picked: that records "none".
export function canSave(current: DietaryRestrictions | null, values: DietaryFormValues): boolean {
  if (current === null) return true;
  return !sameChoices(current.allergens, values.allergens) || !sameChoices(current.diets, values.diets);
}

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
