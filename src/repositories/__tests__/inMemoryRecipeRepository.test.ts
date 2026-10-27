import { createInMemoryRecipeRepository } from "../inMemoryRecipeRepository";

const recipe = {
  title: "Grandma's apple pie",
  servings: 8,
  ingredients: [{ name: "Apples", quantity: 6, unit: "piece" }],
  steps: ["Bake it."],
};

describe("clear", () => {
  it("removes every recipe and notifies", async () => {
    const repo = createInMemoryRecipeRepository();
    const created = await repo.create(recipe);
    if (!created.ok) throw new Error("Expected the recipe to be created");
    const listener = jest.fn();
    repo.subscribe(listener);

    await repo.clear();
    expect(await repo.list()).toEqual([]);
    expect(await repo.getById(created.recipe.id)).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
