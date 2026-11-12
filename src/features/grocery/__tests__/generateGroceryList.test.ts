import { emptyIngredientCatalog, type CatalogMatch, type IngredientCatalog } from "@/repositories/IngredientCatalog";
import { formatAmount, formatQuantity } from "../formatQuantity";
import { generateGroceryList, normaliseName, type RecipeForList } from "../generateGroceryList";
import type { Unit } from "../units";

type Row = RecipeForList["ingredients"][number];

const row = (name: string, quantity: number, unit: Unit, extra: Partial<Row> = {}): Row => ({
  name,
  quantity,
  unit,
  ...extra,
});
const recipe = (servings: number, ingredients: Row[], deletedAt?: number): RecipeForList =>
  deletedAt === undefined ? { servings, ingredients } : { servings, ingredients, deletedAt };

// A fake catalog that knows ingredients by lower-case name (or by ingredientId).
function catalogOf(byName: Record<string, CatalogMatch>): IngredientCatalog {
  return {
    find: ({ ingredientId, name }) =>
      Object.values(byName).find((match) => match.id === ingredientId) ?? byName[name.toLowerCase()],
  };
}

// Plans each [recipeId, servings] pair once and builds the list.
function listFor(
  recipes: Record<string, RecipeForList>,
  entries: [string, number][],
  catalog: IngredientCatalog = emptyIngredientCatalog,
) {
  return generateGroceryList({
    entries: entries.map(([recipeId, servings]) => ({ recipeId, servings })),
    recipesById: new Map(Object.entries(recipes)),
    catalog,
  });
}

// The lines as "name: amount" (the way the screen shows them), for readable expectations.
const shown = (list: ReturnType<typeof listFor>) =>
  list.lines.map((line) => `${line.name}: ${formatAmount(line.quantity, line.unit)}`);

const FLOUR = { id: "all_purpose_flour", gramsPerCup: 125 };

describe("generateGroceryList", () => {
  it("returns nothing for an empty week", () => {
    expect(listFor({}, [])).toEqual({ lines: [], skippedEntries: 0 });
  });

  describe("scaling (N-09)", () => {
    it("scales to the planned servings: a recipe for 4 planned for 6 turns 2 cups into 3 cups", () => {
      const list = listFor({ pancakes: recipe(4, [row("Flour", 2, "cup")]) }, [["pancakes", 6]]);
      expect(list.lines).toEqual([
        { key: "name:flour|volume", name: "Flour", quantity: 3, unit: "cup", family: "volume", uncombined: false },
      ]);
      expect(shown(list)).toEqual(["Flour: 3 cups"]);
    });

    it("scales down too, and adds the same recipe planned twice", () => {
      const recipes = { soup: recipe(4, [row("Carrot", 4, "piece")]) };
      expect(shown(listFor(recipes, [["soup", 1]]))).toEqual(["Carrot: 1 piece"]);
      expect(shown(listFor(recipes, [["soup", 2], ["soup", 6]]))).toEqual(["Carrot: 8 pieces"]);
    });

    it("keeps an amount that doesn't divide evenly at full precision, rounding only for display", () => {
      const list = listFor({ bread: recipe(3, [row("Yeast", 1, "tsp")]) }, [["bread", 1]]);
      expect(list.lines[0].quantity).toBe(1 / 3);
      expect(formatQuantity(list.lines[0].quantity)).toBe("0.33");
    });
  });

  describe("merging the same ingredient (N-07)", () => {
    it("merges across recipes and across days, keeping the first row's name", () => {
      const recipes = {
        pancakes: recipe(2, [row("flour", 200, "g"), row("Milk", 1, "cup")]),
        bread: recipe(4, [row("Flour", 100, "g")]),
      };
      // Pancakes on two days, bread once.
      const list = listFor(recipes, [["pancakes", 2], ["pancakes", 2], ["bread", 4]]);
      expect(shown(list)).toEqual(["flour: 500 g", "Milk: 2 cups"]);
    });

    it("adds exactly, rounding only for display: 0.1 + 0.2 shows 0.3", () => {
      const recipes = { a: recipe(1, [row("Sugar", 0.1, "cup")]), b: recipe(1, [row("Sugar", 0.2, "cup")]) };
      const [line] = listFor(recipes, [["a", 1], ["b", 1]]).lines;
      expect(line.quantity).toBeCloseTo(0.3, 12);
      expect(formatQuantity(line.quantity)).toBe("0.3");
    });

    it("thirty rows of 0.1 still show exactly 3", () => {
      const recipes = { tea: recipe(1, [row("Tea", 0.1, "tsp")]) };
      const entries = Array.from({ length: 30 }, (): [string, number] => ["tea", 1]);
      expect(shown(listFor(recipes, entries))).toEqual(["Tea: 3 tsp"]);
    });

    it("merges names that differ only in case and spaces", () => {
      const recipes = { a: recipe(1, [row("Olive  Oil", 1, "tbsp")]), b: recipe(1, [row("olive oil", 2, "tbsp")]) };
      expect(shown(listFor(recipes, [["a", 1], ["b", 1]]))).toEqual(["Olive  Oil: 3 tbsp"]);
    });

    it("never guesses plurals: Egg and Eggs stay separate lines", () => {
      const recipes = { a: recipe(1, [row("Egg", 1, "piece")]), b: recipe(1, [row("Eggs", 2, "piece")]) };
      const list = listFor(recipes, [["a", 1], ["b", 1]]);
      expect(shown(list)).toEqual(["Egg: 1 piece", "Eggs: 2 pieces"]);
      expect(list.lines.every((line) => !line.uncombined)).toBe(true);
    });

    it("merges rows with the same ingredientId even when their names differ", () => {
      const recipes = {
        a: recipe(1, [row("Plain flour", 100, "g", { ingredientId: "all_purpose_flour" })]),
        b: recipe(1, [row("AP flour", 50, "g", { ingredientId: "all_purpose_flour" })]),
      };
      const list = listFor(recipes, [["a", 1], ["b", 1]]);
      expect(list.lines).toEqual([
        {
          key: "id:all_purpose_flour|mass",
          name: "Plain flour",
          quantity: 150,
          unit: "g",
          family: "mass",
          uncombined: false,
        },
      ]);
    });

    it("ignores an ingredientId that isn't a valid ID and matches by name instead", () => {
      const recipes = {
        a: recipe(1, [row("Salt", 1, "tsp", { ingredientId: "Bad ID" })]),
        b: recipe(1, [row("salt", 1, "tsp", { ingredientId: "../x" })]),
      };
      const [line] = listFor(recipes, [["a", 1], ["b", 1]]).lines;
      expect(line).toMatchObject({ key: "name:salt|volume", quantity: 2, unit: "tsp" });
    });

    it("never merges a name with an ID that happens to be spelled the same", () => {
      const recipes = {
        a: recipe(1, [row("flour", 100, "g")]),
        b: recipe(1, [row("Bread flour", 100, "g", { ingredientId: "flour" })]),
      };
      const keys = listFor(recipes, [["a", 1], ["b", 1]]).lines.map((line) => line.key);
      expect(keys.sort()).toEqual(["id:flour|mass", "name:flour|mass"]);
    });

    it("leaves notes out: rows with different notes still merge, and lines have no note", () => {
      const recipes = {
        a: recipe(1, [row("Onion", 1, "piece", { note: "diced" })]),
        b: recipe(1, [row("Onion", 1, "piece", { note: "sliced" })]),
      };
      const [line] = listFor(recipes, [["a", 1], ["b", 1]]).lines;
      expect(line.quantity).toBe(2);
      expect(line).not.toHaveProperty("note");
    });
  });

  describe("units (N-08)", () => {
    it("keeps a unit every row shares: 2 lb + 1 lb is exactly 3 lb", () => {
      const recipes = { a: recipe(1, [row("Beef", 2, "lb")]), b: recipe(1, [row("Beef", 1, "lb")]) };
      const [line] = listFor(recipes, [["a", 1], ["b", 1]]).lines;
      expect(line).toMatchObject({ quantity: 3, unit: "lb" });
    });

    it("keeps a shared unit even past 1000: 600 g + 600 g is 1200 g", () => {
      const recipes = { a: recipe(1, [row("Rice", 600, "g")]), b: recipe(1, [row("Rice", 600, "g")]) };
      expect(shown(listFor(recipes, [["a", 1], ["b", 1]]))).toEqual(["Rice: 1200 g"]);
    });

    it("shows mixed units of one family in metric: 1 cup + 250 ml is 500 ml", () => {
      const recipes = { a: recipe(1, [row("Milk", 1, "cup")]), b: recipe(1, [row("Milk", 250, "ml")]) };
      const [line] = listFor(recipes, [["a", 1], ["b", 1]]).lines;
      expect(line).toEqual({
        key: "name:milk|volume",
        name: "Milk",
        quantity: 500,
        unit: "ml",
        family: "volume",
        uncombined: false,
      });
    });

    it("switches to kg and l from 1000: 600 g + 0.5 kg is 1.1 kg, 1 l + 2 cups is 1.5 l", () => {
      const recipes = {
        a: recipe(1, [row("Rice", 600, "g"), row("Stock", 1, "l")]),
        b: recipe(1, [row("Rice", 0.5, "kg"), row("Stock", 2, "cup")]),
      };
      expect(shown(listFor(recipes, [["a", 1], ["b", 1]]))).toEqual(["Rice: 1.1 kg", "Stock: 1.5 l"]);
    });

    it("mixed mass units: 1 lb + 8 oz is 680.39 g", () => {
      const recipes = { a: recipe(1, [row("Butter", 1, "lb")]), b: recipe(1, [row("Butter", 8, "oz")]) };
      expect(shown(listFor(recipes, [["a", 1], ["b", 1]]))).toEqual(["Butter: 680.39 g"]);
    });

    it("2 cups + 250 g of flour with 125 g per cup is one line of 500 g", () => {
      const recipes = { pancakes: recipe(1, [row("Flour", 2, "cup")]), bread: recipe(1, [row("Flour", 250, "g")]) };
      const list = listFor(recipes, [["pancakes", 1], ["bread", 1]], catalogOf({ flour: FLOUR }));
      expect(list.lines).toEqual([
        { key: "id:all_purpose_flour|mass", name: "Flour", quantity: 500, unit: "g", family: "mass", uncombined: false },
      ]);
    });

    it("the same rows with no conversion data are two lines, each marked as not combined", () => {
      const recipes = { pancakes: recipe(1, [row("Flour", 2, "cup")]), bread: recipe(1, [row("Flour", 250, "g")]) };
      const list = listFor(recipes, [["pancakes", 1], ["bread", 1]]);
      expect(list.lines).toEqual([
        { key: "name:flour|mass", name: "Flour", quantity: 250, unit: "g", family: "mass", uncombined: true },
        { key: "name:flour|volume", name: "Flour", quantity: 2, unit: "cup", family: "volume", uncombined: true },
      ]);
    });

    it("a catalog match without gramsPerCup still can't combine volume with mass", () => {
      const recipes = { a: recipe(1, [row("Flour", 2, "cup")]), b: recipe(1, [row("Flour", 250, "g")]) };
      const list = listFor(recipes, [["a", 1], ["b", 1]], catalogOf({ flour: { id: "all_purpose_flour" } }));
      expect(list.lines.map((line) => [line.key, line.uncombined])).toEqual([
        ["id:all_purpose_flour|mass", true],
        ["id:all_purpose_flour|volume", true],
      ]);
    });

    it("piece and pinch never merge with other families without conversion data", () => {
      const recipes = {
        a: recipe(1, [row("Garlic", 2, "piece"), row("Salt", 1, "pinch"), row("Pepper", 1, "pinch")]),
        b: recipe(1, [row("Garlic", 10, "g"), row("Salt", 1, "tsp"), row("Pepper", 1, "piece")]),
      };
      const list = listFor(recipes, [["a", 1], ["b", 1]]);
      expect(shown(list)).toEqual([
        "Garlic: 10 g",
        "Garlic: 2 pieces",
        "Pepper: 1 piece",
        "Pepper: 1 pinch",
        "Salt: 1 pinch",
        "Salt: 1 tsp",
      ]);
      expect(list.lines.every((line) => line.uncombined)).toBe(true);
    });

    it("pieces combine with grams through gramsPerPiece; a pinch never does", () => {
      const catalog = catalogOf({
        egg: { id: "egg_whole_raw", gramsPerPiece: 50 },
        salt: { id: "salt", gramsPerCup: 300, gramsPerPiece: 1 },
      });
      const recipes = {
        a: recipe(1, [row("Egg", 2, "piece"), row("Salt", 1, "pinch")]),
        b: recipe(1, [row("Egg", 100, "g"), row("Salt", 1, "tsp")]),
      };
      const list = listFor(recipes, [["a", 1], ["b", 1]], catalog);
      expect(list.lines).toEqual([
        { key: "id:egg_whole_raw|mass", name: "Egg", quantity: 200, unit: "g", family: "mass", uncombined: false },
        // Volume could become grams, but there is nothing to combine it with except the pinch.
        { key: "id:salt|pinch", name: "Salt", quantity: 1, unit: "pinch", family: "pinch", uncombined: true },
        { key: "id:salt|volume", name: "Salt", quantity: 1, unit: "tsp", family: "volume", uncombined: true },
      ]);
    });

    it("combines volume and pieces into grams even with no row in grams", () => {
      const catalog = catalogOf({ butter: { id: "butter", gramsPerCup: 227, gramsPerPiece: 113.5 } });
      const recipes = { a: recipe(1, [row("Butter", 1, "cup")]), b: recipe(1, [row("Butter", 2, "piece")]) };
      const list = listFor(recipes, [["a", 1], ["b", 1]], catalog);
      expect(list.lines).toEqual([
        { key: "id:butter|mass", name: "Butter", quantity: 454, unit: "g", family: "mass", uncombined: false },
      ]);
    });

    it("combines what it can and keeps the rest separate", () => {
      const catalog = catalogOf({ flour: FLOUR });
      const recipes = {
        a: recipe(1, [row("Flour", 1, "cup"), row("Flour", 1, "piece")]),
        b: recipe(1, [row("Flour", 0.875, "kg")]),
      };
      const list = listFor(recipes, [["a", 1], ["b", 1]], catalog);
      // 125 g from the cup + 875 g = 1000 g, shown as 1 kg. The piece has no weight.
      expect(shown(list)).toEqual(["Flour: 1 kg", "Flour: 1 piece"]);
      expect(list.lines.map((line) => line.uncombined)).toEqual([true, true]);
    });
  });

  describe("the ingredient catalog", () => {
    it("its ID wins over the row's own ingredientId", () => {
      const recipes = { a: recipe(1, [row("Flour", 100, "g", { ingredientId: "old_flour_id" })]) };
      const [line] = listFor(recipes, [["a", 1]], catalogOf({ flour: FLOUR })).lines;
      expect(line.key).toBe("id:all_purpose_flour|mass");
    });

    it("is asked with the row's ingredientId and name", () => {
      const find = jest.fn(() => undefined);
      listFor({ a: recipe(1, [row("Flour", 1, "g", { ingredientId: "flour" })]) }, [["a", 1]], { find });
      expect(find).toHaveBeenCalledWith({ ingredientId: "flour", name: "Flour" });
    });

    it.each([
      { id: "Bad ID", gramsPerCup: 125 },
      { id: "../x", gramsPerCup: 125 },
      { id: "flour", gramsPerCup: Number.NaN },
      { id: "flour", gramsPerCup: 0 },
      { id: "flour", gramsPerCup: -125 },
      { id: "flour", gramsPerCup: 1001 },
      { id: "flour", gramsPerPiece: Number.POSITIVE_INFINITY },
      { id: "flour", gramsPerCup: "125" },
    ])("ignores a match that fails validation: %p", (match) => {
      const catalog = { find: () => match as CatalogMatch };
      const recipes = { a: recipe(1, [row("Flour", 2, "cup")]), b: recipe(1, [row("Flour", 250, "g")]) };
      const list = listFor(recipes, [["a", 1], ["b", 1]], catalog);
      expect(list.lines.map((line) => line.key)).toEqual(["name:flour|mass", "name:flour|volume"]);
    });
  });

  describe("missing recipes", () => {
    it("counts a meal whose recipe is missing or deleted, and lists the rest", () => {
      const recipes = {
        kept: recipe(1, [row("Rice", 100, "g")]),
        gone: recipe(1, [row("Fish", 200, "g")], Date.UTC(2026, 10, 1)),
      };
      const list = listFor(recipes, [["kept", 1], ["missing", 2], ["gone", 1], ["missing", 1]]);
      expect(list.skippedEntries).toBe(3);
      expect(shown(list)).toEqual(["Rice: 100 g"]);
    });

    it("a week of only missing recipes is an empty list with every meal counted", () => {
      expect(listFor({}, [["a", 1], ["b", 1]])).toEqual({ lines: [], skippedEntries: 2 });
    });
  });

  describe("keys and order", () => {
    it("a line's key doesn't change with its amount, so a check mark stays", () => {
      const recipes = { soup: recipe(4, [row("Leek", 1, "piece"), row("Stock", 1, "l")]) };
      const keys = (servings: number) => listFor(recipes, [["soup", servings]]).lines.map((line) => line.key);
      expect(keys(2)).toEqual(keys(8));
      expect(keys(2)).toEqual(["name:leek|piece", "name:stock|volume"]);
    });

    it("sorts by name ignoring case and accents, then by key", () => {
      const recipes = {
        a: recipe(1, [row("zucchini", 1, "piece"), row("Éclair", 1, "piece"), row("apple", 1, "piece")]),
        b: recipe(1, [row("Banana", 1, "piece"), row("apple", 100, "g")]),
      };
      const list = listFor(recipes, [["a", 1], ["b", 1]]);
      expect(list.lines.map((line) => line.key)).toEqual([
        "name:apple|mass",
        "name:apple|piece",
        "name:banana|piece",
        "name:éclair|piece",
        "name:zucchini|piece",
      ]);
    });

    it("gives the same list whatever order the recipes are looked up in", () => {
      const recipes = { a: recipe(2, [row("Oats", 1, "cup")]), b: recipe(1, [row("Oats", 100, "ml")]) };
      const forward = listFor(recipes, [["a", 3], ["b", 1]]);
      const backward = listFor(recipes, [["b", 1], ["a", 3]]);
      expect(backward.lines.map(({ key, quantity, unit }) => ({ key, quantity, unit }))).toEqual(
        forward.lines.map(({ key, quantity, unit }) => ({ key, quantity, unit })),
      );
    });
  });

  describe("normaliseName", () => {
    it.each([
      ["Flour", "flour"],
      ["  Brown   Sugar ", "brown sugar"],
      ["Crème fraîche", "crème fraîche"],
      ["Sal​t", "salt"], // zero-width space removed
    ])("%p -> %p", (name, expected) => {
      expect(normaliseName(name)).toBe(expected);
    });
  });

  describe("performance (under the 1 s budget)", () => {
    // Recipes with 50 ingredients each. Names repeat across recipes (so lines merge) and
    // units vary (so some lines can't combine); the catalog knows every third name.
    function bigWeek(entryCount: number) {
      const units: Unit[] = ["g", "cup", "piece", "tbsp", "kg", "ml"];
      const recipes: Record<string, RecipeForList> = {};
      for (let r = 0; r < 21; r += 1) {
        recipes[`recipe-${r}`] = recipe(
          4,
          Array.from({ length: 50 }, (_, i) => row(`Ingredient ${(r * 7 + i) % 120}`, 1 + i, units[(r + i) % units.length])),
        );
      }
      const catalog: IngredientCatalog = {
        find: ({ name }) => {
          const n = Number(name.split(" ")[1]);
          return n % 3 === 0 ? { id: `ingredient_${n}`, gramsPerCup: 120 } : undefined;
        },
      };
      const entries = Array.from({ length: entryCount }, (_, i): [string, number] => [`recipe-${i % 21}`, 1 + (i % 8)]);
      return { recipes, entries, catalog };
    }

    it.each([
      ["21 meals with 50 ingredients each", 21],
      ["the maximum: 10 entries in each of 21 slots", 210],
    ])("%s", (_label, entryCount) => {
      const { recipes, entries, catalog } = bigWeek(entryCount);
      const started = performance.now();
      const list = listFor(recipes, entries, catalog);
      const elapsed = performance.now() - started;
      expect(list.lines.length).toBeGreaterThan(100);
      expect(list.skippedEntries).toBe(0);
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
