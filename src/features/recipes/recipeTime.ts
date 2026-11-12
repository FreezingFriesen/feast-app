import type { Recipe } from "@/repositories/RecipeRepository";

// Prep time plus cook time, in minutes. null when neither was entered, so the screen
// can leave the time out rather than show "0 min".
export function totalMinutes(recipe: Pick<Recipe, "prepTimeMinutes" | "cookTimeMinutes">): number | null {
  const { prepTimeMinutes, cookTimeMinutes } = recipe;
  if (prepTimeMinutes === undefined && cookTimeMinutes === undefined) return null;
  return (prepTimeMinutes ?? 0) + (cookTimeMinutes ?? 0);
}

// 45 -> "45 min", 60 -> "1 h", 95 -> "1 h 35 min".
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
