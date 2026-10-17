import type { MealPlanEntry } from "@/repositories/MealPlanRepository";
import { useMealPlanRepository } from "@/repositories/RepositoryProvider";
import { useEffect, useState } from "react";
import type { DateKey } from "./dates";

// Entries from startDate to endDate (inclusive), reloaded after every change.
export function useMealPlanEntries(startDate: DateKey, endDate: DateKey): MealPlanEntry[] {
  const repository = useMealPlanRepository();
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);

  useEffect(() => {
    let active = true;
    const load = () => {
      repository.listBetween(startDate, endDate).then((list) => {
        if (active) setEntries(list);
      });
    };
    load();
    const unsubscribe = repository.subscribe(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository, startDate, endDate]);

  return entries;
}
