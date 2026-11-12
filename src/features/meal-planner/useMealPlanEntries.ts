import type { MealPlanEntry } from "@/repositories/MealPlanRepository";
import { useMealPlanRepository } from "@/repositories/RepositoryProvider";
import { useEffect, useState } from "react";
import type { DateKey } from "./dates";

// The entries plus whether they have loaded for this range yet. `entries` starts as []
// and keeps the previous range's entries until the new range loads, so a screen that must
// not show "nothing planned" too early (the grocery list) waits for `loaded`.
export function useMealPlanEntriesState(
  startDate: DateKey,
  endDate: DateKey,
): { entries: MealPlanEntry[]; loaded: boolean } {
  const repository = useMealPlanRepository();
  // Which range the entries were loaded for (null before the first load).
  const [state, setState] = useState<{ range: string | null; entries: MealPlanEntry[] }>({
    range: null,
    entries: [],
  });

  // The entries are reloaded after every change. The repository is subscribed to, so that the entries are updated when the repository changes.
  // It also reloads when the date range changes. If this is cleaned up before a load
  // finishes, "active" is false and that result is ignored.
  useEffect(() => {
    let active = true;
    const load = () => {
      repository.listBetween(startDate, endDate).then((list) => {
        if (active) setState({ range: `${startDate}/${endDate}`, entries: list });
      });
    };
    load();
    const unsubscribe = repository.subscribe(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository, startDate, endDate]);

  return { entries: state.entries, loaded: state.range === `${startDate}/${endDate}` };
}

// Entries from startDate to endDate (inclusive), reloaded after every change.
export function useMealPlanEntries(startDate: DateKey, endDate: DateKey): MealPlanEntry[] {
  return useMealPlanEntriesState(startDate, endDate).entries;
}
