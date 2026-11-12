// Shared behaviour for every RecipeRepository (in-memory and SQLite).
import type {
  CreateRecipeResult,
  Recipe,
  RecipeRepository,
  RecipeUpdateResult,
} from "@/repositories/RecipeRepository";
import { MAX_PENDING_BATCH } from "@/repositories/Syncable";
import { ID_PATTERN } from "@/validation/patterns";

export const T0 = Date.UTC(2026, 9, 1);

// What the new-recipe form sends (toRecipeInput leaves blank optional boxes as undefined).
export const RECIPE_INPUT = {
  title: "Grandma's apple pie",
  servings: 8,
  ingredients: [{ name: "Apples", quantity: 6, unit: "piece" }],
  steps: ["Bake it."],
};

// A recipe as another device uploaded it (a sync download). The ID is the document ID.
export const INCOMING_ID = "remote-recipe-1";
export const INCOMING_RECIPE = {
  ...RECIPE_INPUT,
  mealTypes: ["dinner"],
  dietTags: [],
  createdAt: T0,
  updatedAt: T0,
  schemaVersion: 1,
};

export function expectCreated(result: CreateRecipeResult): Recipe {
  if (!result.ok) throw new Error("Expected the recipe to be created");
  return result.recipe;
}

function expectUpdated(result: RecipeUpdateResult): Recipe {
  if (!result.ok) throw new Error(`Expected ok, got ${result.reason}`);
  return result.recipe;
}

// A recipe without its ID: the shape listPending returns as `data`.
const dataOf = ({ id: _id, ...data }: Recipe) => data;

export function describeRecipeRepositoryContract(
  name: string,
  create: (now: () => number) => Promise<RecipeRepository>,
) {
  // A clock the test controls, so updatedAt values are predictable.
  async function setup() {
    let time = T0 + 1_000;
    const repo = await create(() => time);
    return {
      repo,
      setTime: (value: number) => {
        time = value;
      },
    };
  }

  // A recipe that was downloaded (so it isn't pending), at updatedAt T0.
  async function setupWithIncoming() {
    const context = await setup();
    expect(await context.repo.mergeIncoming(INCOMING_ID, INCOMING_RECIPE)).toBe("applied");
    return context;
  }

  describe(`RecipeRepository contract: ${name}`, () => {
    describe("create", () => {
      it("stores a valid recipe with timestamps and a safe ID, and marks it pending", async () => {
        const { repo } = await setup();
        const recipe = expectCreated(await repo.create(RECIPE_INPUT));
        expect(recipe).toEqual({
          ...RECIPE_INPUT,
          mealTypes: [],
          dietTags: [],
          id: recipe.id,
          createdAt: T0 + 1_000,
          updatedAt: T0 + 1_000,
          schemaVersion: 1,
        });
        expect(recipe.id).toMatch(ID_PATTERN);
        expect(await repo.getById(recipe.id)).toEqual(recipe);
        expect(await repo.listPending(10)).toEqual([{ id: recipe.id, data: dataOf(recipe) }]);
        expect(await repo.pendingCount()).toBe(1);
      });

      it("stores the parsed data, not the raw input", async () => {
        const { repo } = await setup();
        const recipe = expectCreated(
          await repo.create({
            ...RECIPE_INPUT,
            title: "  Pan​cakes  ",
            id: "chosen-id",
            isAdmin: true,
            createdAt: 1,
            deletedAt: 5,
          }),
        );
        expect(recipe.title).toBe("Pancakes");
        expect(recipe.id).not.toBe("chosen-id");
        expect(recipe).not.toHaveProperty("isAdmin");
        expect(recipe.createdAt).toBe(T0 + 1_000);
        expect(recipe.deletedAt).toBeUndefined();
      });

      it("never stores keys set to undefined (Firestore refuses them)", async () => {
        const { repo } = await setup();
        const recipe = expectCreated(
          await repo.create({
            ...RECIPE_INPUT,
            description: undefined,
            notes: undefined,
            ingredients: [{ name: "Apples", quantity: 6, unit: "piece", note: undefined }],
          }),
        );
        const [pending] = await repo.listPending(10);
        // A JSON round trip drops undefined values, so this fails if any are left.
        expect(JSON.parse(JSON.stringify(pending.data))).toStrictEqual(pending.data);
        expect(await repo.getById(recipe.id)).toStrictEqual(recipe);
      });

      it.each([
        { title: "'; DROP TABLE recipes;--" },
        { title: "<script>alert(1)</script>" },
        { title: "a".repeat(10_000) },
        { title: "" },
        { title: "🍕" },
        { title: "​" },
        { servings: 0 },
        { servings: "8" },
        { ingredients: [] },
        { steps: [""] },
        { mealTypes: ["brunch"] },
      ])("rejects %p and writes nothing", async (patch) => {
        const { repo } = await setup();
        expect(await repo.create({ ...RECIPE_INPUT, ...patch })).toMatchObject({ ok: false });
        expect(await repo.list()).toEqual([]);
        expect(await repo.pendingCount()).toBe(0);
      });

      it("refuses to save with a clock outside the timestamp range", async () => {
        const { repo, setTime } = await setup();
        setTime(1_000);
        expect(await repo.create(RECIPE_INPUT)).toMatchObject({ ok: false });
        expect(await repo.list()).toEqual([]);
      });
    });

    describe("update", () => {
      it("replaces the fields, bumps updatedAt and marks it pending; id, createdAt and schemaVersion stay", async () => {
        const { repo, setTime } = await setup();
        const recipe = expectCreated(await repo.create(RECIPE_INPUT));
        await repo.markSynced(recipe.id, recipe.updatedAt);
        setTime(T0 + 5_000);

        const updated = expectUpdated(
          await repo.update(recipe.id, { ...RECIPE_INPUT, title: "Apple crumble", description: "Easier" }),
        );
        expect(updated).toEqual({
          ...recipe,
          title: "Apple crumble",
          description: "Easier",
          updatedAt: T0 + 5_000,
        });
        expect(await repo.getById(recipe.id)).toEqual(updated);
        expect(await repo.listPending(10)).toEqual([{ id: recipe.id, data: dataOf(updated) }]);
      });

      it("drops optional fields the new input leaves out", async () => {
        const { repo } = await setup();
        const recipe = expectCreated(await repo.create({ ...RECIPE_INPUT, notes: "Serve warm" }));
        const updated = expectUpdated(await repo.update(recipe.id, RECIPE_INPUT));
        expect(updated).not.toHaveProperty("notes");
        expect(await repo.getById(recipe.id)).not.toHaveProperty("notes");
      });

      // The edit screen sends every row back with its ingredientId and note (which the form
      // doesn't show), so an edit must store them, not drop them.
      it("keeps ingredientId and note on ingredient rows", async () => {
        const { repo } = await setup();
        const recipe = expectCreated(await repo.create(RECIPE_INPUT));
        const ingredients = [
          { ingredientId: "apple", name: "Apples", quantity: 6, unit: "piece", note: "tart" },
          { name: "Sugar", quantity: 100, unit: "g" },
        ];
        const updated = expectUpdated(await repo.update(recipe.id, { ...RECIPE_INPUT, ingredients }));
        expect(updated.ingredients).toStrictEqual(ingredients);
        expect((await repo.getById(recipe.id))?.ingredients).toStrictEqual(ingredients);
      });

      it("ignores an id, createdAt or schemaVersion in the input", async () => {
        const { repo } = await setup();
        const recipe = expectCreated(await repo.create(RECIPE_INPUT));
        const updated = expectUpdated(
          await repo.update(recipe.id, { ...RECIPE_INPUT, id: "other", createdAt: T0 + 9, schemaVersion: 9 }),
        );
        expect(updated).toMatchObject({ id: recipe.id, createdAt: recipe.createdAt, schemaVersion: 1 });
      });

      it("never moves updatedAt backwards when the clock goes back", async () => {
        const { repo, setTime } = await setupWithIncoming();
        setTime(T0 - 60_000);
        const updated = expectUpdated(await repo.update(INCOMING_ID, { ...RECIPE_INPUT, title: "Mine" }));
        expect(updated.updatedAt).toBe(T0 + 1);
        // So the copy it replaced can't undo the edit
        expect(await repo.mergeIncoming(INCOMING_ID, INCOMING_RECIPE)).toBe("kept_local");
        expect((await repo.getById(INCOMING_ID))?.title).toBe("Mine");
      });

      it.each([
        { title: "'; DROP TABLE recipes;--" },
        { title: "<script>alert(1)</script>" },
        { servings: 101 },
        { steps: ["a".repeat(1_001)] },
      ])("rejects %p and leaves the recipe unchanged", async (patch) => {
        const { repo } = await setupWithIncoming();
        const before = await repo.getById(INCOMING_ID);
        expect(await repo.update(INCOMING_ID, { ...RECIPE_INPUT, ...patch })).toMatchObject({
          ok: false,
          reason: "invalid",
        });
        expect(await repo.getById(INCOMING_ID)).toEqual(before);
        expect(await repo.pendingCount()).toBe(0);
      });

      it("returns not_found for unknown, unsafe and deleted IDs", async () => {
        const { repo } = await setupWithIncoming();
        await repo.remove(INCOMING_ID);
        for (const id of ["missing", "../x", "a/b", "", INCOMING_ID]) {
          expect(await repo.update(id, RECIPE_INPUT)).toEqual({ ok: false, reason: "not_found" });
        }
      });
    });

    describe("remove (soft delete)", () => {
      it("hides the recipe from every read, keeps it deleted, and uploads it as a tombstone", async () => {
        const { repo, setTime } = await setupWithIncoming();
        setTime(T0 + 7_000);
        expect(await repo.remove(INCOMING_ID)).toBe(true);

        expect(await repo.getById(INCOMING_ID)).toBeUndefined();
        expect(await repo.list()).toEqual([]);
        expect(await repo.update(INCOMING_ID, RECIPE_INPUT)).toEqual({ ok: false, reason: "not_found" });
        expect(await repo.remove(INCOMING_ID)).toBe(false);
        expect(await repo.listPending(10)).toEqual([
          {
            id: INCOMING_ID,
            data: { ...INCOMING_RECIPE, updatedAt: T0 + 7_000, deletedAt: T0 + 7_000 },
          },
        ]);
      });

      it("never moves updatedAt backwards when the clock goes back", async () => {
        const { repo, setTime } = await setupWithIncoming();
        setTime(T0 - 60_000);
        await repo.remove(INCOMING_ID);
        const [tombstone] = await repo.listPending(10);
        expect(tombstone.data).toMatchObject({ updatedAt: T0 + 1, deletedAt: T0 + 1 });
      });

      it("returns false for unknown or unsafe IDs", async () => {
        const { repo } = await setup();
        for (const id of ["missing", "", "a/b", "'; DROP TABLE recipes;--"]) {
          expect(await repo.remove(id)).toBe(false);
        }
      });
    });

    describe("list", () => {
      it("leaves out deleted recipes and puts the most recently changed first", async () => {
        const { repo, setTime } = await setup();
        const ids: string[] = [];
        for (const [index, title] of ["First", "Second", "Third"].entries()) {
          setTime(T0 + 1_000 * (index + 1));
          ids.push(expectCreated(await repo.create({ ...RECIPE_INPUT, title })).id);
        }
        setTime(T0 + 10_000);
        await repo.update(ids[0], { ...RECIPE_INPUT, title: "First, edited" });
        expect((await repo.list()).map((recipe) => recipe.title)).toEqual(["First, edited", "Third", "Second"]);

        await repo.remove(ids[2]);
        expect((await repo.list()).map((recipe) => recipe.title)).toEqual(["First, edited", "Second"]);
      });

      it("keeps the order they were added when updatedAt is the same", async () => {
        const { repo } = await setup();
        for (const title of ["One", "Two", "Three"]) {
          await repo.create({ ...RECIPE_INPUT, title });
        }
        expect((await repo.list()).map((recipe) => recipe.title)).toEqual(["One", "Two", "Three"]);
      });
    });

    describe("sync hooks: pending and markSynced", () => {
      it("every local write marks the recipe pending; downloads don't", async () => {
        const { repo, setTime } = await setupWithIncoming();
        expect(await repo.pendingCount()).toBe(0);

        setTime(T0 + 2_000);
        await repo.update(INCOMING_ID, RECIPE_INPUT);
        expect(await repo.pendingCount()).toBe(1);
        expect(await repo.markSynced(INCOMING_ID, T0 + 2_000)).toBe(true);
        expect(await repo.pendingCount()).toBe(0);

        setTime(T0 + 3_000);
        await repo.remove(INCOMING_ID);
        expect(await repo.pendingCount()).toBe(1);
      });

      it("lists the oldest edits first, up to the limit", async () => {
        const { repo, setTime } = await setup();
        const ids: string[] = [];
        for (let index = 0; index < 3; index += 1) {
          setTime(T0 + 1_000 * (3 - index));
          ids.push(expectCreated(await repo.create(RECIPE_INPUT)).id);
        }
        expect((await repo.listPending(2)).map((record) => record.id)).toEqual([ids[2], ids[1]]);
        expect(await repo.listPending(MAX_PENDING_BATCH)).toHaveLength(3);
      });

      it("continues from a cursor, so records behind a failed one are still reached", async () => {
        const { repo } = await setup();
        const ids: string[] = [];
        for (let index = 0; index < 3; index += 1) {
          ids.push(expectCreated(await repo.create(RECIPE_INPUT)).id);
        }
        // Same updatedAt for all three, so the order falls back to the ID.
        const sorted = [...ids].sort();
        const pages: string[] = [];
        let page = await repo.listPending(1);
        while (page.length > 0) {
          pages.push(page[0].id);
          page = await repo.listPending(1, { updatedAt: page[0].data.updatedAt, id: page[0].id });
        }
        expect(pages).toEqual(sorted);
      });

      it.each([{ updatedAt: "x", id: "a" }, { updatedAt: T0, id: "../x" }, null])(
        "lists nothing for cursor %p",
        async (cursor) => {
          const { repo } = await setup();
          await repo.create(RECIPE_INPUT);
          expect(await repo.listPending(10, cursor as never)).toEqual([]);
        },
      );

      it.each([0, -1, 1.5, NaN, Infinity, MAX_PENDING_BATCH + 1])("lists nothing for limit %p", async (limit) => {
        const { repo } = await setup();
        await repo.create(RECIPE_INPUT);
        expect(await repo.listPending(limit)).toEqual([]);
      });

      it("markSynced clears pending only when updatedAt still matches", async () => {
        const { repo } = await setup();
        const recipe = expectCreated(await repo.create(RECIPE_INPUT));
        expect(await repo.markSynced(recipe.id, recipe.updatedAt - 1)).toBe(false);
        expect(await repo.pendingCount()).toBe(1);
        expect(await repo.markSynced(recipe.id, recipe.updatedAt)).toBe(true);
        expect(await repo.listPending(10)).toEqual([]);
        expect(await repo.markSynced(recipe.id, recipe.updatedAt)).toBe(false);
      });

      it("an edit made during an upload stays pending", async () => {
        const { repo, setTime } = await setup();
        const recipe = expectCreated(await repo.create(RECIPE_INPUT));
        const [uploading] = await repo.listPending(10);

        setTime(T0 + 5_000);
        await repo.update(recipe.id, { ...RECIPE_INPUT, title: "Edited mid-upload" });
        expect(await repo.markSynced(uploading.id, uploading.data.updatedAt)).toBe(false);

        const [next] = await repo.listPending(10);
        expect(next.data).toMatchObject({ title: "Edited mid-upload", updatedAt: T0 + 5_000 });
      });

      it("markSynced ignores unsafe IDs and bad timestamps", async () => {
        const { repo } = await setup();
        const recipe = expectCreated(await repo.create(RECIPE_INPUT));
        expect(await repo.markSynced("../x", recipe.updatedAt)).toBe(false);
        expect(await repo.markSynced("'; DROP TABLE recipes;--", recipe.updatedAt)).toBe(false);
        expect(await repo.markSynced(recipe.id, NaN)).toBe(false);
        expect(await repo.markSynced(recipe.id, "1" as unknown as number)).toBe(false);
        expect(await repo.pendingCount()).toBe(1);
      });
    });

    describe("mergeIncoming", () => {
      it("stores a valid recipe under the ID, not marked pending", async () => {
        const { repo } = await setupWithIncoming();
        expect(await repo.getById(INCOMING_ID)).toEqual({ ...INCOMING_RECIPE, id: INCOMING_ID });
        expect(await repo.pendingCount()).toBe(0);
      });

      it("stores the parsed data, not the raw input", async () => {
        const { repo } = await setup();
        await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_RECIPE, id: "other", isAdmin: true, allergens: ["milk"] });
        const recipe = await repo.getById(INCOMING_ID);
        expect(recipe?.id).toBe(INCOMING_ID);
        expect(recipe).not.toHaveProperty("isAdmin");
        expect(recipe).not.toHaveProperty("allergens");
      });

      it("last edit wins: newer replaces, older and equal keep the local copy", async () => {
        const { repo } = await setupWithIncoming();
        expect(await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_RECIPE, title: "Newer", updatedAt: T0 + 10 })).toBe(
          "applied",
        );
        expect(await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_RECIPE, title: "Older", updatedAt: T0 + 5 })).toBe(
          "kept_local",
        );
        expect(await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_RECIPE, title: "Tie", updatedAt: T0 + 10 })).toBe(
          "kept_local",
        );
        expect((await repo.getById(INCOMING_ID))?.title).toBe("Newer");
      });

      it("a newer download replaces a local edit, which is then no longer pending", async () => {
        const { repo } = await setupWithIncoming();
        await repo.update(INCOMING_ID, { ...RECIPE_INPUT, title: "Local" });
        expect(await repo.pendingCount()).toBe(1);
        expect(
          await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_RECIPE, title: "Remote", updatedAt: T0 + 50_000 }),
        ).toBe("applied");
        expect((await repo.getById(INCOMING_ID))?.title).toBe("Remote");
        expect(await repo.pendingCount()).toBe(0);
      });

      it("never brings a deleted recipe back, even with a newer copy", async () => {
        const { repo, setTime } = await setupWithIncoming();
        setTime(T0 + 5_000);
        await repo.remove(INCOMING_ID);

        for (const updatedAt of [T0, T0 + 5_000, T0 + 60_000]) {
          expect(await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_RECIPE, updatedAt })).toBe("kept_local");
        }
        expect(await repo.getById(INCOMING_ID)).toBeUndefined();
        expect(await repo.list()).toEqual([]);
        expect(await repo.pendingCount()).toBe(1);
      });

      it("a delete always wins: an older deleted copy replaces a newer local edit", async () => {
        const { repo, setTime } = await setupWithIncoming();
        setTime(T0 + 50_000);
        await repo.update(INCOMING_ID, { ...RECIPE_INPUT, title: "Edited after the delete" });

        const deletedElsewhere = { ...INCOMING_RECIPE, updatedAt: T0 + 10, deletedAt: T0 + 10 };
        expect(await repo.mergeIncoming(INCOMING_ID, deletedElsewhere)).toBe("applied");
        expect(await repo.getById(INCOMING_ID)).toBeUndefined();
        // The edit can never upload over the deleted copy, so it is no longer pending.
        expect(await repo.pendingCount()).toBe(0);
      });

      it("applies a newer deleted copy, and the recipe then stays deleted", async () => {
        const { repo } = await setupWithIncoming();
        const deleted = { ...INCOMING_RECIPE, updatedAt: T0 + 10, deletedAt: T0 + 10 };
        expect(await repo.mergeIncoming(INCOMING_ID, deleted)).toBe("applied");
        expect(await repo.getById(INCOMING_ID)).toBeUndefined();
        expect(await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_RECIPE, updatedAt: T0 + 20 })).toBe("kept_local");
        // Two devices that deleted it at different times end up with the same copy
        expect(await repo.mergeIncoming(INCOMING_ID, { ...deleted, updatedAt: T0 + 30, deletedAt: T0 + 30 })).toBe(
          "applied",
        );
      });

      it.each([
        { title: "'; DROP TABLE recipes;--" },
        { title: "<script>alert(1)</script>" },
        { mealTypes: undefined },
        { dietTags: ["vegan", "vegan"] },
        { ingredients: [{ name: "<b>Flour</b>", quantity: 1, unit: "g" }] },
        { steps: ["a".repeat(1_001)] },
        { updatedAt: "tomorrow" },
        { updatedAt: T0 - 1 },
        { deletedAt: -1 },
        { schemaVersion: 2 },
      ])("rejects invalid data %p and stores nothing", async (patch) => {
        const { repo } = await setup();
        expect(await repo.mergeIncoming(INCOMING_ID, { ...INCOMING_RECIPE, ...patch })).toBe("invalid");
        expect(await repo.getById(INCOMING_ID)).toBeUndefined();
        expect(await repo.list()).toEqual([]);
      });

      it.each(["", "../x", "a/b", "ABC", "abc def", "a".repeat(101), "'; DROP TABLE recipes;--"])(
        "rejects unsafe ID %p",
        async (id) => {
          const { repo } = await setup();
          expect(await repo.mergeIncoming(id, INCOMING_RECIPE)).toBe("invalid");
          expect(await repo.list()).toEqual([]);
        },
      );

      it("round trip: what listPending uploads, another device stores as the same recipe", async () => {
        const phone = await setup();
        const recipe = expectCreated(
          await phone.repo.create({
            ...RECIPE_INPUT,
            description: "Flaky crust",
            prepTimeMinutes: 20,
            mealTypes: ["dinner", "lunch"],
            ingredients: [{ name: "Apples", quantity: 6, unit: "piece", note: "tart", ingredientId: "apple" }],
            dietTags: ["vegetarian"],
          }),
        );
        const [upload] = await phone.repo.listPending(10);

        const tablet = await setup();
        expect(await tablet.repo.mergeIncoming(upload.id, upload.data)).toBe("applied");
        expect(await tablet.repo.getById(recipe.id)).toStrictEqual(recipe);
      });
    });

    it("clear removes every recipe, pending ones too, and notifies", async () => {
      const { repo } = await setupWithIncoming();
      const recipe = expectCreated(await repo.create(RECIPE_INPUT));
      const listener = jest.fn();
      repo.subscribe(listener);

      await repo.clear();
      expect(await repo.list()).toEqual([]);
      expect(await repo.getById(recipe.id)).toBeUndefined();
      expect(await repo.getById(INCOMING_ID)).toBeUndefined();
      expect(await repo.pendingCount()).toBe(0);
      expect(await repo.listPending(10)).toEqual([]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("notifies after every change until unsubscribed", async () => {
      const { repo } = await setup();
      const listener = jest.fn();
      const unsubscribe = repo.subscribe(listener);

      const recipe = expectCreated(await repo.create(RECIPE_INPUT));
      await repo.update(recipe.id, { ...RECIPE_INPUT, servings: 4 });
      await repo.remove(recipe.id);
      await repo.mergeIncoming(INCOMING_ID, INCOMING_RECIPE);
      expect(listener).toHaveBeenCalledTimes(4);

      // Rejected writes, kept-local merges and markSynced do not notify.
      await repo.create({ ...RECIPE_INPUT, servings: 0 });
      await repo.update(INCOMING_ID, { ...RECIPE_INPUT, servings: 0 });
      await repo.remove(recipe.id);
      await repo.mergeIncoming(INCOMING_ID, INCOMING_RECIPE);
      await repo.markSynced(recipe.id, T0 + 1_001);
      expect(listener).toHaveBeenCalledTimes(4);

      unsubscribe();
      await repo.create(RECIPE_INPUT);
      expect(listener).toHaveBeenCalledTimes(4);
    });
  });
}
