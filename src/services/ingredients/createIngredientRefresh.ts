// Downloads the shared ingredient data and swaps it into the phone's copy (N-08), only when
// the whole download is complete and good: a bad or partial download never replaces a good
// copy (fail closed). Runs in the foreground: at app start, after sign in and when the
// connection comes back if the copy is over a day old, and on "Sync now" (forced).
import { MAX_INGREDIENTS, type IngredientRepository } from "@/repositories/IngredientRepository";
import type { AuthService } from "@/services/auth/AuthService";
import type { ConnectivityService } from "@/services/connectivity/ConnectivityService";
import { isDomainError } from "@/services/domainErrors";
import { storedIngredientSchema, type Ingredient } from "@/validation/ingredientSchema";
import { ID_PATTERN } from "@/validation/patterns";
import type { IngredientRefresh, RefreshKeptReason, RefreshOutcome, RefreshResult } from "./IngredientRefresh";
import { MAX_INGREDIENT_PAGE_SIZE, type RemoteIngredientPage, type RemoteIngredientSource } from "./RemoteIngredientSource";

// A copy younger than this is fresh: no download unless forced.
export const INGREDIENT_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Pages are as large as the server allows, and there are at most this many. With the
// MAX_INGREDIENTS cap (2,000), more pages than this means something is wrong.
export const INGREDIENT_PAGE_SIZE = MAX_INGREDIENT_PAGE_SIZE;
export const MAX_INGREDIENT_PAGES = 10;
// A download is used only if at most this share of its documents failed validation.
export const MAX_SKIPPED_PERCENT = 10;

type IngredientRefreshDependencies = {
  auth: Pick<AuthService, "currentUser" | "subscribe">;
  connectivity: ConnectivityService;
  source: RemoteIngredientSource;
  repository: Pick<IngredientRepository, "replaceAll" | "meta">;
  now?: () => number;
};

export type IngredientRefreshEngine = IngredientRefresh & {
  // Refreshes if due now, then on sign in and when the connection comes back. Returns a
  // function that stops listening.
  start(): () => void;
  // The last run's result, for tests and diagnostics. Never shown, never logged.
  lastResult(): RefreshResult | null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const resultOf = (outcome: RefreshOutcome, valid = 0, skipped = 0, reason?: RefreshKeptReason): RefreshResult =>
  reason === undefined ? { outcome, valid, skipped } : { outcome, valid, skipped, reason };

// One downloaded document, validated like any data from outside the app. The ID is checked
// before anything else and set last, so the document's body can't claim a different one.
function parseDocument(document: unknown): Ingredient | undefined {
  if (!isPlainObject(document)) return undefined;
  const { id, data } = document;
  if (typeof id !== "string" || !ID_PATTERN.test(id) || !isPlainObject(data)) return undefined;
  const parsed = storedIngredientSchema.safeParse({ ...data, id });
  return parsed.success ? parsed.data : undefined;
}

// What a failed page means: offline and signed out are expected; anything else is a failure.
function pageFailure(error: unknown): { outcome: RefreshOutcome; reason?: RefreshKeptReason } {
  if (isDomainError(error) && error.code === "offline") return { outcome: "offline" };
  if (isDomainError(error) && error.code === "not_owner") return { outcome: "signed_out" };
  return { outcome: "kept_cache", reason: "failed" };
}

type Download = { ok: true; ingredients: Ingredient[]; skipped: number } | { ok: false; result: RefreshResult };

export function createIngredientRefresh({
  auth,
  connectivity,
  source,
  repository,
  now = Date.now,
}: IngredientRefreshDependencies): IngredientRefreshEngine {
  let inFlight: { forced: boolean; promise: Promise<RefreshResult> } | null = null;
  let last: RefreshResult | null = null;

  // Is the copy on the phone less than a day old? A copy "from the future" (the clock was
  // moved back since) counts as old, so it gets replaced.
  async function isFresh(): Promise<boolean> {
    try {
      const meta = await repository.meta();
      if (meta === null) return false;
      const age = now() - meta.fetchedAt;
      return age >= 0 && age <= INGREDIENT_REFRESH_INTERVAL_MS;
    } catch {
      return false;
    }
  }

  // Every page, in ID order, keeping the valid documents and counting the rest.
  async function download(): Promise<Download> {
    const valid = new Map<string, Ingredient>();
    let skipped = 0;
    let after: string | undefined;
    for (let page = 0; page < MAX_INGREDIENT_PAGES; page += 1) {
      let response: RemoteIngredientPage;
      try {
        response = await source.listPage(INGREDIENT_PAGE_SIZE, after);
      } catch (error) {
        const { outcome, reason } = pageFailure(error);
        return { ok: false, result: resultOf(outcome, valid.size, skipped, reason) };
      }
      const docs: unknown[] = Array.isArray(response?.docs) ? response.docs : [];
      for (const document of docs) {
        const ingredient = parseDocument(document);
        // A repeated ID counts as skipped: the first copy is kept.
        if (ingredient === undefined || valid.has(ingredient.id)) skipped += 1;
        else valid.set(ingredient.id, ingredient);
      }
      if (valid.size + skipped > MAX_INGREDIENTS) {
        return { ok: false, result: resultOf("kept_cache", valid.size, skipped, "too_many") };
      }
      const next = response?.next;
      if (next === undefined) return { ok: true, ingredients: [...valid.values()], skipped };
      // The cursor must be an ID that moves forward, or the download could loop.
      if (typeof next !== "string" || !ID_PATTERN.test(next) || (after !== undefined && next <= after)) {
        return { ok: false, result: resultOf("kept_cache", valid.size, skipped, "failed") };
      }
      after = next;
    }
    return { ok: false, result: resultOf("kept_cache", valid.size, skipped, "incomplete") };
  }

  async function run(force: boolean): Promise<RefreshResult> {
    try {
      if (!force && (await isFresh())) return resultOf("fresh");
      // Only signed-in users may read the ingredients (the Security Rules).
      if (auth.currentUser() === null) return resultOf("signed_out");
      if (!(await connectivity.isOnline())) return resultOf("offline");

      const downloaded = await download();
      if (!downloaded.ok) return downloaded.result;
      const { ingredients, skipped } = downloaded;
      if (ingredients.length === 0) return resultOf("kept_cache", 0, skipped, "none_valid");
      if (skipped * 100 > (ingredients.length + skipped) * MAX_SKIPPED_PERCENT) {
        return resultOf("kept_cache", ingredients.length, skipped, "too_many_invalid");
      }
      try {
        // All or nothing: a failure here leaves the old copy (see the repository).
        await repository.replaceAll(ingredients, now());
      } catch {
        return resultOf("kept_cache", ingredients.length, skipped, "failed");
      }
      return resultOf("updated", ingredients.length, skipped);
    } catch {
      // Nothing is lost: the copy on the phone stays. No details are kept or logged.
      return resultOf("kept_cache", 0, 0, "failed");
    }
  }

  // One run at a time. A call during a run shares it, except a forced call during an
  // unforced run: that waits for it, then downloads anyway unless the run just did.
  function refreshIfDue({ force = false }: { force?: boolean } = {}): Promise<RefreshResult> {
    if (inFlight !== null && (inFlight.forced || !force)) return inFlight.promise;
    const previous = inFlight?.promise;
    const promise = (async () => {
      if (previous !== undefined && (await previous).outcome === "updated") return previous;
      return run(force);
    })().then((result) => {
      last = result;
      return result;
    });
    const entry = { forced: force, promise };
    inFlight = entry;
    const clear = () => {
      if (inFlight === entry) inFlight = null;
    };
    promise.then(clear, clear);
    return promise;
  }

  return {
    refreshIfDue,

    start() {
      // Waits for a run in progress first: one that began just before the sign in (or the
      // reconnect) saw the old state, so its answer doesn't count for the new one.
      const refresh = () => {
        const running = inFlight?.promise ?? Promise.resolve();
        void running.then(() => refreshIfDue());
      };
      const stops = [
        auth.subscribe((user) => {
          if (user !== null) refresh();
        }),
        connectivity.subscribe((online) => {
          if (online) refresh();
        }),
      ];
      refresh();
      return () => stops.forEach((stop) => stop());
    },

    lastResult: () => last,
  };
}
