// Scales an ingredient amount from the servings a recipe is written for to the servings
// wanted (N-09, #8). Shared by the grocery list and the recipe detail screen, so both
// show the same numbers. Multiply before dividing, and never round: rounding happens
// only for display (formatQuantity).
export function scaleQuantity(quantity: number, fromServings: number, toServings: number): number {
  return (quantity * toServings) / fromServings;
}
