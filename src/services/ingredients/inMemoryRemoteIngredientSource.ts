import type { InMemoryServer } from "@/services/backend/inMemoryServer";
import { domainError } from "@/services/domainErrors";
import type { Ingredient } from "@/validation/ingredientSchema";
import { ingredientPageArgsSchema, type RemoteIngredientPage, type RemoteIngredientSource } from "./RemoteIngredientSource";
import { SAMPLE_INGREDIENTS } from "./sampleIngredients";

type StoredDocument = { id: string; data: string };

// Development backend: the ingredients collection on the in-memory server, holding the
// sample list unless a test passes its own. Stored the way the import writes Firestore
// (the id is the document's name, not a field) and copied out as JSON, like data crossing
// a network. Signed-out reads are refused, like the Security Rules, and every call goes
// through server.run, so the offline switch, latency and failNext("ingredients.list") apply.
export function createInMemoryRemoteIngredientSource(
  server: InMemoryServer,
  ingredients: readonly Ingredient[] = SAMPLE_INGREDIENTS,
): RemoteIngredientSource {
  const documents: StoredDocument[] = ingredients
    .map((ingredient) => {
      const data: Record<string, unknown> = { ...ingredient };
      delete data.id;
      return { id: ingredient.id, data: JSON.stringify(data) };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    async listPage(pageSize, after): Promise<RemoteIngredientPage> {
      const args = ingredientPageArgsSchema.safeParse({ limit: pageSize, after });
      if (!args.success) throw domainError("invalid_input");
      return server.run("ingredients.list", (): RemoteIngredientPage => {
        if (server.signedInUid === null) throw domainError("not_owner");
        const cursor = args.data.after;
        const page = documents
          .filter((document) => cursor === undefined || document.id > cursor)
          .slice(0, args.data.limit)
          .map((document) => ({ id: document.id, data: JSON.parse(document.data) as unknown }));
        const last = page.at(-1);
        return last !== undefined && page.length === args.data.limit ? { docs: page, next: last.id } : { docs: page };
      });
    },
  };
}
