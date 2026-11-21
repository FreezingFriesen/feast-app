// Shared behaviour for every IngredientRepository (in-memory and SQLite).
import { MAX_INGREDIENTS, type IngredientRepository } from "@/repositories/IngredientRepository";
import type { Ingredient } from "@/validation/ingredientSchema";
import { makeIngredient, manyIngredients } from "../ingredientFixtures";

export const FETCHED_AT = Date.UTC(2026, 10, 19, 12);
export const LATER = FETCHED_AT + 60 * 60 * 1000;

export const FLOUR = makeIngredient("all_purpose_flour", "All-purpose flour", { aliases: ["flour"], gramsPerCup: 125, allergens: ["wheat"] });
export const EGG = makeIngredient("egg_whole_raw", "Egg, whole, raw", {
  aliases: ["eggs"],
  gramsPerPiece: 50,
  pieceDescription: "1 large egg, shelled",
  allergens: ["eggs"],
  allergensReviewed: true,
});
export const MILK = makeIngredient("milk_whole", "Whole milk", { gramsPerCup: 240, allergens: ["milk"] });

const invalidCode = { name: "DomainError", code: "invalid_input" };

export function describeIngredientRepositoryContract(name: string, create: () => Promise<IngredientRepository>) {
  // A repository holding FLOUR and EGG, and a listener counting its notifications.
  async function withCopy() {
    const repo = await create();
    await repo.replaceAll([FLOUR, EGG], FETCHED_AT);
    const listener = jest.fn();
    repo.subscribe(listener);
    return { repo, listener };
  }

  describe(`IngredientRepository contract: ${name}`, () => {
    it("starts with no copy", async () => {
      const repo = await create();
      expect(await repo.list()).toEqual([]);
      expect(await repo.meta()).toBeNull();
    });

    it("keeps a copy, ordered by ID, with when it was downloaded and its size", async () => {
      const repo = await create();
      await repo.replaceAll([MILK, FLOUR, EGG], FETCHED_AT);
      expect(await repo.list()).toEqual([FLOUR, EGG, MILK]);
      expect(await repo.meta()).toEqual({ fetchedAt: FETCHED_AT, count: 3 });
    });

    it("stores the cleaned data and drops keys the schema doesn't have", async () => {
      const repo = await create();
      const messy = { ...FLOUR, name: "  All-purpose flour ", isAdmin: true } as unknown as Ingredient;
      await repo.replaceAll([messy], FETCHED_AT);
      expect(await repo.list()).toEqual([FLOUR]);
    });

    it("keeps attack text in free text as plain text", async () => {
      const repo = await create();
      const notes = "'; DROP TABLE ingredients;-- <script>alert(1)</script>";
      await repo.replaceAll([{ ...FLOUR, notes }], FETCHED_AT);
      expect((await repo.list())[0].notes).toBe(notes);
      await repo.replaceAll([EGG], LATER);
      expect(await repo.list()).toEqual([EGG]);
    });

    it("replaces the whole copy: removed ingredients go, changed ones change", async () => {
      const { repo, listener } = await withCopy();
      const newFlour = { ...FLOUR, gramsPerCup: 120 };
      await repo.replaceAll([newFlour, MILK], LATER);
      expect(await repo.list()).toEqual([newFlour, MILK]);
      expect(await repo.meta()).toEqual({ fetchedAt: LATER, count: 2 });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("hands out copies, so changing what it returned changes nothing stored", async () => {
      const { repo } = await withCopy();
      const [first] = await repo.list();
      first.name = "Changed";
      first.allergens.push("milk");
      expect(await repo.list()).toEqual([FLOUR, EGG]);
    });

    it("takes the most it allows", async () => {
      const repo = await create();
      await repo.replaceAll(manyIngredients(MAX_INGREDIENTS), FETCHED_AT);
      expect(await repo.list()).toHaveLength(MAX_INGREDIENTS);
      expect(await repo.meta()).toEqual({ fetchedAt: FETCHED_AT, count: MAX_INGREDIENTS });
    });

    describe("refuses a bad replacement and keeps the old copy", () => {
      const badLists: [string, unknown, unknown][] = [
        ["an empty list", [], LATER],
        ["more than the limit", manyIngredients(MAX_INGREDIENTS + 1), LATER],
        ["duplicate IDs", [MILK, { ...MILK, name: "Milk again" }], LATER],
        ["an invalid ingredient in the middle", [MILK, { ...FLOUR, allergens: ["gluten"] }, EGG], LATER],
        ["an ID that isn't safe in a path", [{ ...MILK, id: "../x" }], LATER],
        ["an attack name", [{ ...MILK, name: "<script>alert(1)</script>" }], LATER],
        ["a list that isn't a list", "milk", LATER],
        ["a missing fetchedAt", [MILK], undefined],
        ["a fetchedAt that isn't a whole number", [MILK], 1.5],
        ["a negative fetchedAt", [MILK], -1],
        ["a fetchedAt that isn't a number", [MILK], "2026-11-19"],
      ];

      it.each(badLists)("%s", async (_label, ingredients, fetchedAt) => {
        const { repo, listener } = await withCopy();
        await expect(repo.replaceAll(ingredients as Ingredient[], fetchedAt as number)).rejects.toMatchObject(invalidCode);
        expect(await repo.list()).toEqual([FLOUR, EGG]);
        expect(await repo.meta()).toEqual({ fetchedAt: FETCHED_AT, count: 2 });
        expect(listener).not.toHaveBeenCalled();
      });
    });

    it("runs two replacements one after the other, so the later one wins whole", async () => {
      const repo = await create();
      await Promise.all([repo.replaceAll([FLOUR, EGG], FETCHED_AT), repo.replaceAll([MILK], LATER)]);
      expect(await repo.list()).toEqual([MILK]);
      expect(await repo.meta()).toEqual({ fetchedAt: LATER, count: 1 });
    });

    it("clear removes the copy and tells listeners", async () => {
      const { repo, listener } = await withCopy();
      await repo.clear();
      expect(await repo.list()).toEqual([]);
      expect(await repo.meta()).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);
      // And a new copy can be stored afterwards.
      await repo.replaceAll([MILK], LATER);
      expect(await repo.list()).toEqual([MILK]);
    });

    it("stops telling a listener once it unsubscribes", async () => {
      const repo = await create();
      const listener = jest.fn();
      const unsubscribe = repo.subscribe(listener);
      await repo.replaceAll([MILK], FETCHED_AT);
      unsubscribe();
      await repo.replaceAll([EGG], LATER);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
}
