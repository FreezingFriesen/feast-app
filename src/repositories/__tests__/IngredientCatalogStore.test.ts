import { generateGroceryList } from "@/features/grocery/generateGroceryList";
import { SAMPLE_INGREDIENTS } from "@/services/ingredients/sampleIngredients";
import { domainError } from "@/services/domainErrors";
import { makeIngredient } from "@/testing/ingredientFixtures";
import type { Ingredient } from "@/validation/ingredientSchema";
import { emptyIngredientCatalog } from "../IngredientCatalog";
import { createIngredientCatalogStore } from "../IngredientCatalogStore";
import { createInMemoryIngredientRepository } from "../inMemoryIngredientRepository";
import type { IngredientRepository } from "../IngredientRepository";

const FETCHED_AT = Date.UTC(2026, 10, 19, 12);
// Lets the reload a repository change starts finish.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function setup(initial?: readonly Ingredient[]) {
  const repository = createInMemoryIngredientRepository();
  if (initial) await repository.replaceAll(initial, FETCHED_AT);
  const store = createIngredientCatalogStore(repository);
  const listener = jest.fn();
  store.subscribe(listener);
  return { repository, store, listener };
}

describe("ingredient catalog store", () => {
  it("is empty until it loads, like the app before the catalog existed", async () => {
    const { store } = await setup([...SAMPLE_INGREDIENTS]);
    expect(store.getSnapshot()).toBe(emptyIngredientCatalog);
    expect(store.getUpdatedAt()).toBeNull();
  });

  it("loads the copy from the phone, tells listeners, and says when it was downloaded", async () => {
    const { store, listener } = await setup([...SAMPLE_INGREDIENTS]);
    await store.load();
    expect(store.getSnapshot().find({ name: "eggs" })?.id).toBe("egg_whole_raw");
    expect(store.getUpdatedAt()).toBe(FETCHED_AT);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the same snapshot until the data changes, then hands out a new one", async () => {
    const { store, repository, listener } = await setup([...SAMPLE_INGREDIENTS]);
    await store.load();
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);

    await repository.replaceAll([makeIngredient("salt", "Salt")], FETCHED_AT + 1);
    await settle();
    const second = store.getSnapshot();
    expect(second).not.toBe(first);
    expect(Object.isFrozen(second)).toBe(true);
    expect(second.find({ name: "salt" })?.id).toBe("salt");
    expect(second.find({ name: "eggs" })).toBeUndefined();
    expect(store.getUpdatedAt()).toBe(FETCHED_AT + 1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("goes back to empty when the copy is cleared", async () => {
    const { store, repository } = await setup([...SAMPLE_INGREDIENTS]);
    await store.load();
    await repository.clear();
    await settle();
    expect(store.getSnapshot().find({ name: "eggs" })).toBeUndefined();
    expect(store.getUpdatedAt()).toBeNull();
  });

  it("keeps what it has if the copy can't be read, and never throws", async () => {
    const { store, repository, listener } = await setup([...SAMPLE_INGREDIENTS]);
    await store.load();
    const loaded = store.getSnapshot();
    jest.spyOn(repository, "list").mockRejectedValueOnce(domainError("storage_failed"));
    await expect(store.load()).resolves.toBeUndefined();
    expect(store.getSnapshot()).toBe(loaded);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("never lets an older, slower load replace a newer one", async () => {
    let finishSlowRead!: (ingredients: Ingredient[]) => void;
    const repository: IngredientRepository = {
      ...createInMemoryIngredientRepository(),
      meta: async () => ({ fetchedAt: FETCHED_AT, count: 1 }),
      list: jest
        .fn()
        .mockImplementationOnce(() => new Promise<Ingredient[]>((resolve) => (finishSlowRead = resolve)))
        .mockResolvedValueOnce([makeIngredient("salt", "Salt")]),
    };
    const store = createIngredientCatalogStore(repository);
    const slow = store.load();
    await store.load();
    finishSlowRead([makeIngredient("pepper", "Pepper")]);
    await slow;
    expect(store.getSnapshot().find({ name: "salt" })?.id).toBe("salt");
    expect(store.getSnapshot().find({ name: "pepper" })).toBeUndefined();
  });

  it("shows no date when the copy's download time can't be read, but still serves the copy", async () => {
    const { store, repository } = await setup([...SAMPLE_INGREDIENTS]);
    jest.spyOn(repository, "meta").mockResolvedValueOnce(null);
    await store.load();
    expect(store.getSnapshot().find({ name: "eggs" })?.id).toBe("egg_whole_raw");
    expect(store.getUpdatedAt()).toBeNull();
  });

  it("stops telling a listener once it unsubscribes", async () => {
    const { store } = await setup([...SAMPLE_INGREDIENTS]);
    const listener = jest.fn();
    store.subscribe(listener)();
    await store.load();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("the grocery list with the catalog (N-08)", () => {
  it("combines 1 cup of flour and 100 g of flour into one line in grams, using gramsPerCup", async () => {
    const { store } = await setup([...SAMPLE_INGREDIENTS]);
    await store.load();
    const list = generateGroceryList({
      entries: [
        { recipeId: "pancakes", servings: 1 },
        { recipeId: "bread", servings: 1 },
      ],
      recipesById: new Map([
        ["pancakes", { servings: 1, ingredients: [{ name: "Flour", quantity: 1, unit: "cup" as const }] }],
        ["bread", { servings: 1, ingredients: [{ name: "All-purpose flour", quantity: 100, unit: "g" as const }] }],
      ]),
      catalog: store.getSnapshot(),
    });
    // A 250 ml cup of flour is 125 g (gramsPerCup), plus 100 g.
    expect(list.lines).toEqual([
      { key: "id:all_purpose_flour|mass", name: "Flour", quantity: 225, unit: "g", family: "mass", uncombined: false },
    ]);
  });

  it("without the catalog, the same rows stay apart, as before", () => {
    const list = generateGroceryList({
      entries: [{ recipeId: "pancakes", servings: 1 }],
      recipesById: new Map([
        [
          "pancakes",
          {
            servings: 1,
            ingredients: [
              { name: "Flour", quantity: 1, unit: "cup" as const },
              { name: "Flour", quantity: 100, unit: "g" as const },
            ],
          },
        ],
      ]),
      catalog: emptyIngredientCatalog,
    });
    expect(list.lines.map((line) => line.key)).toEqual(["name:flour|mass", "name:flour|volume"]);
  });
});
