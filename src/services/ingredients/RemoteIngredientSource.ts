// The shared ingredient data on the server (ingredients/{id}, Edwin's import), read-only.
// The refresh service depends on this interface only; implementations are picked in
// createAppServices, so moving to React Native Firebase only changes them.
import { z } from "zod";
import { ID_PATTERN } from "@/validation/patterns";

// The largest page the server is asked for.
export const MAX_INGREDIENT_PAGE_SIZE = 500;

// One document as the server returned it: its ID and its fields (no id field). Untrusted:
// the refresh service validates every one before anything is stored.
export type RemoteIngredientDocument = { id: string; data: unknown };

export type RemoteIngredientPage = {
  docs: RemoteIngredientDocument[];
  // The ID to continue after, or undefined when this was the last page.
  next?: string;
};

export type RemoteIngredientSource = {
  // Up to `limit` documents ordered by ID, starting after the ID `after`. Reads from the
  // server only (never a cache) and needs a signed-in user (the Security Rules require
  // one). Rejects with a DomainError: "invalid_input" (bad limit or cursor), "not_owner"
  // (signed out, or the Rules refused), "offline" (no connection or too slow), "unknown".
  listPage(limit: number, after?: string): Promise<RemoteIngredientPage>;
};

// listPage's arguments, checked by every implementation before anything is built from them.
export const ingredientPageArgsSchema = z.object({
  limit: z.number().int().min(1).max(MAX_INGREDIENT_PAGE_SIZE),
  after: z.string().max(100).regex(ID_PATTERN).optional(),
});
