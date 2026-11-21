// Shared behaviour for every RemoteIngredientSource: the in-memory one (npm test) and the
// Firebase one against the emulators and the real Security Rules (npm run test:backend).
// The emulator's ingredients collection is shared with other test files, so these tests
// check that the seeded ingredients are there, never that nothing else is.
import type { RemoteIngredientDocument, RemoteIngredientSource } from "@/services/ingredients/RemoteIngredientSource";
import { storedIngredientSchema, type Ingredient } from "@/validation/ingredientSchema";

export type RemoteIngredientSourceHarness = {
  // The ingredients the server was seeded with.
  seeded: readonly Ingredient[];
  // A source reading as a signed-in user. online: false makes the phone say it's offline.
  signedIn(options?: { online?: boolean }): Promise<RemoteIngredientSource>;
  // A source with nobody signed in.
  signedOut(): Promise<RemoteIngredientSource>;
};

// Every page from the start, following `next`, with a safety stop.
async function readAll(source: RemoteIngredientSource, limit: number) {
  const pages: RemoteIngredientDocument[][] = [];
  let after: string | undefined;
  for (let page = 0; page < 200; page += 1) {
    const result = await source.listPage(limit, after);
    pages.push(result.docs);
    if (result.next === undefined) return pages;
    after = result.next;
  }
  throw new Error("listPage never reached the end");
}

const code = (value: string) => ({ name: "DomainError", code: value });

export function describeRemoteIngredientSourceContract(name: string, harness: RemoteIngredientSourceHarness) {
  describe(`RemoteIngredientSource contract: ${name}`, () => {
    it("pages through every ingredient in ID order, each page within the limit, none twice", async () => {
      const source = await harness.signedIn();
      const pages = await readAll(source, 3);
      pages.forEach((page) => expect(page.length).toBeLessThanOrEqual(3));
      const ids = pages.flat().map((document) => document.id);
      expect(ids).toEqual([...ids].sort());
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(expect.arrayContaining(harness.seeded.map((ingredient) => ingredient.id)));
    });

    it("returns each seeded ingredient's fields, without an id field, exactly as imported", async () => {
      const source = await harness.signedIn();
      const byId = new Map((await readAll(source, 500)).flat().map((document) => [document.id, document.data]));
      for (const ingredient of harness.seeded) {
        const data = byId.get(ingredient.id) as Record<string, unknown>;
        expect(data).not.toHaveProperty("id");
        expect(storedIngredientSchema.parse({ ...data, id: ingredient.id })).toEqual(ingredient);
      }
    });

    it("continues after the given ID, and ends with no cursor", async () => {
      const source = await harness.signedIn();
      const [first, second] = (await readAll(source, 500)).flat().map((document) => document.id);
      const page = await source.listPage(1, first);
      expect(page.docs.map((document) => document.id)).toEqual([second]);
      expect(page.next).toBe(second);

      const pastTheEnd = await source.listPage(10, "zzzzzzzzzz");
      expect(pastTheEnd).toEqual({ docs: [] });
    });

    it("refuses a signed-out reader", async () => {
      await expect((await harness.signedOut()).listPage(10)).rejects.toMatchObject(code("not_owner"));
    });

    it("reports offline without reading", async () => {
      await expect((await harness.signedIn({ online: false })).listPage(10)).rejects.toMatchObject(code("offline"));
    });

    it.each([0, -1, 1.5, Number.NaN, 501])("refuses a page size of %p", async (limit) => {
      await expect((await harness.signedIn()).listPage(limit)).rejects.toMatchObject(code("invalid_input"));
    });

    it.each(["../x", "Bad ID", "", "a".repeat(101), "a/b"])("refuses a cursor of %p", async (after) => {
      await expect((await harness.signedIn()).listPage(10, after)).rejects.toMatchObject(code("invalid_input"));
    });
  });
}
