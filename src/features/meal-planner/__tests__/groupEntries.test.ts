import type { MealPlanEntry } from "@/repositories/MealPlanRepository";
import { groupByDay } from "../groupEntries";

function entry(id: string, date: string, mealType: MealPlanEntry["mealType"], createdAt: number): MealPlanEntry {
  return { id, date, mealType, recipeId: "recipe-1", servings: 2, createdAt, updatedAt: createdAt, schemaVersion: 1 };
}

describe("groupByDay", () => {
  it("groups entries by date and slot, oldest first", () => {
    const days = groupByDay([
      entry("c", "2026-10-19", "dinner", 3),
      entry("a", "2026-10-19", "dinner", 1),
      entry("b", "2026-10-19", "breakfast", 2),
      entry("d", "2026-10-20", "lunch", 4),
    ]);

    const monday = days.get("2026-10-19");
    expect(monday?.breakfast.map((e) => e.id)).toEqual(["b"]);
    expect(monday?.lunch).toEqual([]);
    expect(monday?.dinner.map((e) => e.id)).toEqual(["a", "c"]);
    expect(days.get("2026-10-20")?.lunch.map((e) => e.id)).toEqual(["d"]);
  });

  it("only contains days that have entries", () => {
    expect(groupByDay([]).size).toBe(0);
    expect(groupByDay([entry("a", "2026-10-19", "lunch", 1)]).has("2026-10-20")).toBe(false);
  });
});
