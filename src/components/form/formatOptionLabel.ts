// "keto_friendly" -> "Keto friendly". The label for a value from a fixed list (diets,
// allergens, meal types). A plain module with no React Native, so pure code (the recipe
// filter's text, the restrictions summary) can use it in plain Node too. ChipSelect
// re-exports it.
export function formatOptionLabel(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
