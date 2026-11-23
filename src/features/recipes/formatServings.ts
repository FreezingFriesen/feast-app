// "1 serving" or "4 servings". A plain module, so pure code (the recipe detail view)
// can use it as well as the screens.
export function formatServings(servings: number): string {
  return servings === 1 ? "1 serving" : `${servings} servings`;
}
