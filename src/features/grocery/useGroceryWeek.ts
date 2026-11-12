import { addDays, type DateKey } from "@/features/meal-planner/dates";
import { useMealPlanEntriesState } from "@/features/meal-planner/useMealPlanEntries";
import { recipesById, useRecipesState } from "@/features/recipes/useRecipes";
import type { ManualGroceryItem } from "@/repositories/GroceryRepository";
import { useGroceryRepository, useIngredientCatalog } from "@/repositories/RepositoryProvider";
import { useEffect, useState } from "react";
import { generateGroceryList, type GroceryList } from "./generateGroceryList";

// Everything the Grocery screen shows for one week, once it has all loaded.
export type GroceryWeek =
  | { loaded: false }
  | {
      loaded: true;
      // How many meals are planned this week (including ones whose recipe is gone).
      plannedMeals: number;
      list: GroceryList;
      // Keys of the checked generated lines.
      checked: ReadonlySet<string>;
      manualItems: ManualGroceryItem[];
    };

type GroceryState = { week: DateKey | null; checked: ReadonlySet<string>; manualItems: ManualGroceryItem[] };

// The week's check marks and manual items, reloaded after every change.
function useGroceryState(weekStart: DateKey): GroceryState & { loaded: boolean } {
  const repository = useGroceryRepository();
  const [state, setState] = useState<GroceryState>({ week: null, checked: new Set(), manualItems: [] });

  // If this is cleaned up before a load finishes, "active" is false and that result is ignored.
  useEffect(() => {
    let active = true;
    const load = () => {
      Promise.all([repository.listCheckedKeys(weekStart), repository.listManualItems(weekStart)]).then(
        ([keys, manualItems]) => {
          if (active) setState({ week: weekStart, checked: new Set(keys), manualItems });
        },
      );
    };
    load();
    const unsubscribe = repository.subscribe(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository, weekStart]);

  return { ...state, loaded: state.week === weekStart };
}

// The week's grocery list (#6), worked out from the meal plan on the phone (works
// offline), plus the user's own check marks and items (N-10). Not loaded until the meal
// plan, the recipes and the grocery state have all loaded for this week, so the screen
// never shows "no meals planned" or the previous week's list by mistake.
export function useGroceryWeek(weekStart: DateKey): GroceryWeek {
  const plan = useMealPlanEntriesState(weekStart, addDays(weekStart, 6));
  const recipes = useRecipesState();
  const grocery = useGroceryState(weekStart);
  const catalog = useIngredientCatalog();

  if (!plan.loaded || !recipes.loaded || !grocery.loaded) return { loaded: false };
  return {
    loaded: true,
    plannedMeals: plan.entries.length,
    list: generateGroceryList({ entries: plan.entries, recipesById: recipesById(recipes.recipes), catalog }),
    checked: grocery.checked,
    manualItems: grocery.manualItems,
  };
}
