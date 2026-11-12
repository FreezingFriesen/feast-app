import type { Recipe } from "@/repositories/RecipeRepository";
import { recipeSchema } from "@/validation/recipeSchema";
import {
  emptyIngredientRow,
  emptyRecipeForm,
  inputMaxLength,
  isRecipeFormChanged,
  RECIPE_NOT_FOUND_MESSAGE,
  recipeUpdateFailure,
  toRecipeForm,
  toRecipeInput,
  type IngredientFormRow,
  type RecipeFormValues,
} from "../recipeForm";

// A recipe with only the required fields, as recipeSchema stores it.
const minimal = recipeSchema.parse({
  title: "Pancakes",
  servings: 4,
  ingredients: [{ name: "Flour", quantity: 200, unit: "g" }],
  steps: ["Mix", "Cook"],
});

// Every optional field, both tag lists, and an ingredient matched with an ingredientId
// and a note (neither of which the form shows).
const full = recipeSchema.parse({
  title: "Crème brûlée",
  description: "Silky custard",
  servings: 6,
  prepTimeMinutes: 0,
  cookTimeMinutes: 45,
  mealTypes: ["lunch", "dinner"],
  ingredients: [
    { ingredientId: "heavy_cream", name: "Heavy cream", quantity: 500, unit: "ml", note: "very cold" },
    { name: "Sugar", quantity: 0.5, unit: "cup" },
  ],
  steps: ["Heat the cream.", "Bake in a water bath."],
  dietTags: ["vegetarian", "gluten_free"],
  notes: "Torch just before serving",
});

// What the form saves: toRecipeInput, then the same check the form and repository run.
const check = (values: RecipeFormValues) => recipeSchema.safeParse(toRecipeInput(values));
const save = (values: RecipeFormValues) => recipeSchema.parse(toRecipeInput(values));
const roundTrip = (recipe: Parameters<typeof toRecipeForm>[0]) => save(toRecipeForm(recipe));

// The form with the first ingredient row changed.
const editIngredient = (values: RecipeFormValues, patch: Partial<IngredientFormRow>): RecipeFormValues => ({
  ...values,
  ingredients: values.ingredients.map((row, index) => (index === 0 ? { ...row, ...patch } : row)),
});

describe("toRecipeForm (N-01 edit)", () => {
  it("turns a minimal recipe into form text, with blank optional boxes", () => {
    expect(toRecipeForm(minimal)).toEqual({
      title: "Pancakes",
      description: "",
      servings: "4",
      prepTimeMinutes: "",
      cookTimeMinutes: "",
      mealTypes: [],
      ingredients: [{ key: expect.any(String), name: "Flour", quantity: "200", unit: "g" }],
      steps: [
        { key: expect.any(String), text: "Mix" },
        { key: expect.any(String), text: "Cook" },
      ],
      dietTags: [],
      notes: "",
    });
  });

  it("fills in every optional field, keeps 0 as \"0\", and carries the match and note", () => {
    const form = toRecipeForm(full);
    expect(form).toMatchObject({
      title: "Crème brûlée",
      description: "Silky custard",
      servings: "6",
      prepTimeMinutes: "0",
      cookTimeMinutes: "45",
      mealTypes: ["lunch", "dinner"],
      dietTags: ["vegetarian", "gluten_free"],
      notes: "Torch just before serving",
    });
    expect(form.ingredients).toEqual([
      {
        key: expect.any(String),
        name: "Heavy cream",
        quantity: "500",
        unit: "ml",
        note: "very cold",
        match: { ingredientId: "heavy_cream", name: "Heavy cream" },
      },
      { key: expect.any(String), name: "Sugar", quantity: "0.5", unit: "cup" },
    ]);
  });

  it("gives every row a fresh, unique key each time", () => {
    const first = toRecipeForm(full);
    const second = toRecipeForm(full);
    const keys = [...first.ingredients, ...first.steps, ...second.ingredients, ...second.steps].map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("copies the tag lists, so editing the form can't change the recipe", () => {
    const form = toRecipeForm(full);
    expect(form.mealTypes).not.toBe(full.mealTypes);
    expect(form.dietTags).not.toBe(full.dietTags);
  });

  it("never shortens a saved value, even past the box's usual limit", () => {
    const long = recipeSchema.parse({
      ...minimal,
      title: "𠀀".repeat(100), // 100 letters, 200 UTF-16 units
      ingredients: [{ name: "Salt", quantity: 0.1 + 0.2, unit: "g" }],
    });
    const form = toRecipeForm(long);
    expect(form.title).toBe("𠀀".repeat(100));
    expect(form.ingredients[0].quantity).toBe("0.30000000000000004");
  });
});

describe("round trip: toRecipeForm -> toRecipeInput -> recipeSchema", () => {
  it.each([
    ["a minimal recipe", minimal],
    ["a recipe with every field", full],
  ])("gives back %s unchanged", (_label, recipe) => {
    expect(roundTrip(recipe)).toEqual(recipe);
  });

  it("gives back a saved recipe's own fields (the repository fields aren't in the form)", () => {
    const saved: Recipe = {
      ...full,
      id: "recipe-1",
      createdAt: Date.UTC(2026, 9, 1),
      updatedAt: Date.UTC(2026, 9, 2),
      schemaVersion: 1,
    };
    expect(roundTrip(saved)).toEqual(full);
  });

  it.each([0.1 + 0.2, 1e-7, 0.333333, 100_000])("keeps the quantity %p exactly", (quantity) => {
    const recipe = recipeSchema.parse({ ...minimal, ingredients: [{ name: "Salt", quantity, unit: "g" }] });
    expect(roundTrip(recipe).ingredients[0].quantity).toBe(quantity);
  });
});

describe("toRecipeInput", () => {
  it("leaves blank or space-only optional boxes out", () => {
    const values = { ...toRecipeForm(full), description: "   ", prepTimeMinutes: "", cookTimeMinutes: " ", notes: "" };
    const parsed = save(values);
    expect(parsed.description).toBeUndefined();
    expect(parsed.prepTimeMinutes).toBeUndefined();
    expect(parsed.cookTimeMinutes).toBeUndefined();
    expect(parsed.notes).toBeUndefined();
  });

  it("turns \"abc\" into NaN, which the schema rejects", () => {
    const values = { ...toRecipeForm(minimal), servings: "abc" };
    expect((toRecipeInput(values) as { servings: unknown }).servings).toBeNaN();
    expect(check(values).success).toBe(false);
    expect(check(editIngredient(toRecipeForm(minimal), { quantity: "abc" })).success).toBe(false);
  });

  it("a new recipe's rows (no match, no note) save no ingredientId or note", () => {
    const values: RecipeFormValues = {
      ...emptyRecipeForm(),
      title: "Toast",
      servings: "1",
      ingredients: [{ ...emptyIngredientRow(), name: "Bread", quantity: "2", unit: "piece" }],
      steps: [{ key: "step", text: "Toast it." }],
    };
    const [row] = save(values).ingredients;
    expect(row).toEqual({ name: "Bread", quantity: 2, unit: "piece" });
    expect(row.ingredientId).toBeUndefined();
    expect(row.note).toBeUndefined();
  });
});

describe("ingredient matches: ingredientId and note", () => {
  const matched = recipeSchema.parse({
    ...minimal,
    ingredients: [{ ingredientId: "all_purpose_flour", name: "Flour", quantity: 200, unit: "g", note: "sifted" }],
  });
  const renamed = (name: string) => editIngredient(toRecipeForm(matched), { name });
  const firstRow = (values: RecipeFormValues) => save(values).ingredients[0];

  it("keeps the ingredientId and note while the name is unchanged", () => {
    expect(firstRow(toRecipeForm(matched))).toEqual({
      ingredientId: "all_purpose_flour",
      name: "Flour",
      quantity: 200,
      unit: "g",
      note: "sifted",
    });
  });

  it("keeps them when other fields of the row change", () => {
    const row = firstRow(editIngredient(toRecipeForm(matched), { quantity: "250", unit: "kg" }));
    expect(row).toMatchObject({ ingredientId: "all_purpose_flour", quantity: 250, unit: "kg", note: "sifted" });
  });

  it("spaces around the name don't count as a rename", () => {
    expect(firstRow(renamed("  Flour "))).toMatchObject({ ingredientId: "all_purpose_flour", name: "Flour" });
  });

  it.each(["Almond flour", "flour", "Flour 2"])(
    "drops the ingredientId when renamed to %p (reads as unmatched), but keeps the note",
    (name) => {
      const row = firstRow(renamed(name));
      expect(row.ingredientId).toBeUndefined();
      expect(row).toMatchObject({ name, note: "sifted" });
    },
  );

  it("gets the ingredientId back if the name is changed back", () => {
    const back = editIngredient(renamed("Rye flour"), { name: "Flour" });
    expect(firstRow(back).ingredientId).toBe("all_purpose_flour");
  });

  it("a removed row's match never moves to another row", () => {
    const form = toRecipeForm(matched);
    const replaced = {
      ...form,
      ingredients: [{ ...emptyIngredientRow(), name: "Flour", quantity: "200", unit: "g" as const }],
    };
    expect(firstRow(replaced).ingredientId).toBeUndefined();
  });

  it("keeps an empty ingredientId exactly as saved", () => {
    const unmatched = recipeSchema.parse({
      ...minimal,
      ingredients: [{ ingredientId: "", name: "Flour", quantity: 200, unit: "g" }],
    });
    expect(roundTrip(unmatched)).toEqual(unmatched);
  });
});

describe("isRecipeFormChanged", () => {
  const initial = toRecipeForm(full);

  it("is false for the same values, and for the same recipe with new row keys", () => {
    expect(isRecipeFormChanged(initial, initial)).toBe(false);
    expect(isRecipeFormChanged(initial, { ...initial })).toBe(false);
    expect(isRecipeFormChanged(initial, toRecipeForm(full))).toBe(false);
  });

  it("is false when tags are picked again in another order", () => {
    const reordered = { ...initial, mealTypes: [...initial.mealTypes].reverse(), dietTags: [...initial.dietTags].reverse() };
    expect(isRecipeFormChanged(initial, reordered)).toBe(false);
  });

  it.each<[string, (values: RecipeFormValues) => RecipeFormValues]>([
    ["title", (v) => ({ ...v, title: "Crème caramel" })],
    ["title (a space typed at the end)", (v) => ({ ...v, title: `${v.title} ` })],
    ["description", (v) => ({ ...v, description: "Rich custard" })],
    ["description (cleared)", (v) => ({ ...v, description: "" })],
    ["servings", (v) => ({ ...v, servings: "7" })],
    ["prep time", (v) => ({ ...v, prepTimeMinutes: "5" })],
    ["cook time", (v) => ({ ...v, cookTimeMinutes: "" })],
    ["meal types (one added)", (v) => ({ ...v, mealTypes: [...v.mealTypes, "breakfast"] })],
    ["meal types (one removed)", (v) => ({ ...v, mealTypes: ["lunch"] })],
    ["ingredient name", (v) => editIngredient(v, { name: "Double cream" })],
    ["ingredient quantity", (v) => editIngredient(v, { quantity: "400" })],
    ["ingredient unit", (v) => editIngredient(v, { unit: "cup" })],
    ["ingredient unit (cleared)", (v) => editIngredient(v, { unit: "" })],
    ["ingredients (one added)", (v) => ({ ...v, ingredients: [...v.ingredients, emptyIngredientRow()] })],
    ["ingredients (one removed)", (v) => ({ ...v, ingredients: v.ingredients.slice(1) })],
    ["step text", (v) => ({ ...v, steps: [{ ...v.steps[0], text: "Warm the cream." }, v.steps[1]] })],
    ["steps (one added)", (v) => ({ ...v, steps: [...v.steps, { key: "new", text: "" }] })],
    ["steps (one removed)", (v) => ({ ...v, steps: v.steps.slice(0, 1) })],
    ["diet tags (one added)", (v) => ({ ...v, dietTags: [...v.dietTags, "vegan"] })],
    ["diet tags (one removed)", (v) => ({ ...v, dietTags: ["vegetarian"] })],
    ["notes", (v) => ({ ...v, notes: "Serve cold" })],
  ])("is true when the %s changes", (_label, change) => {
    expect(isRecipeFormChanged(initial, change(initial))).toBe(true);
  });
});

describe("inputMaxLength", () => {
  it("uses the limit unless the value is already longer", () => {
    expect(inputMaxLength(100, "")).toBe(100);
    expect(inputMaxLength(100, "Pancakes")).toBe(100);
    expect(inputMaxLength(8, "12345678")).toBe(8);
    expect(inputMaxLength(8, "0.30000000000000004")).toBe(19);
  });
});

describe("recipeUpdateFailure", () => {
  it("shows the repository's validation errors under the fields", () => {
    const invalid = recipeSchema.safeParse({});
    if (invalid.success) throw new Error("Expected the empty recipe to be invalid");
    expect(recipeUpdateFailure({ ok: false, reason: "invalid", error: invalid.error })).toEqual({
      ok: false,
      error: invalid.error,
    });
  });

  it("explains that a deleted recipe's changes weren't saved", () => {
    expect(recipeUpdateFailure({ ok: false, reason: "not_found" })).toEqual({
      ok: false,
      message: RECIPE_NOT_FOUND_MESSAGE,
    });
  });
});

// Every text box on the edit path, through the same conversion and schema the form and
// repository use. Nothing here is executed or rendered as HTML: names are rejected, and
// free text is kept as plain text.
describe("attack and boundary input on the edit form", () => {
  const base = toRecipeForm(full);
  const withTitle = (title: string) => ({ ...base, title });
  const withSteps = (...texts: string[]) => ({ ...base, steps: texts.map((text, index) => ({ key: `s${index}`, text })) });
  const withFreeText = (text: string) => ({
    ...editIngredient(base, { note: text }),
    description: text,
    notes: text,
    steps: [{ key: "s0", text }],
  });

  const NAME_REJECTS: [string, string][] = [
    ["SQL injection", "'; DROP TABLE recipes;--"],
    ["a script tag", "<script>alert(1)</script>"],
    ["10,000 characters", "a".repeat(10_000)],
    ["empty", ""],
    ["only spaces", "   "],
    ["an emoji", "🍕"],
    ["text with an emoji", "Pizza 🍕"],
    ["only a zero-width space", "​"],
    ["only a direction override", "‮"],
    ["only a control character", "\u0007"],
  ];

  it.each(NAME_REJECTS)("title and ingredient name reject %s", (_label, attack) => {
    expect(check(withTitle(attack)).success).toBe(false);
    expect(check(editIngredient(base, { name: attack })).success).toBe(false);
  });

  it("strips invisible and control characters from names before checking them", () => {
    expect(save(withTitle("Pan​cakes\u0007")).title).toBe("Pancakes");
    expect(save(editIngredient(base, { name: "‮Heavy cream‍" })).ingredients[0].name).toBe("Heavy cream");
  });

  it.each([
    ["SQL injection", "'; DROP TABLE recipes;--"],
    ["a script tag", "<script>alert(1)</script>"],
    ["emoji", "🍕 Pizza night"],
    ["punctuation and accents", "Crème brûlée & “quotes” / 50% (Mom’s)"],
  ])("free text keeps %s as plain text", (_label, text) => {
    const parsed = save(withFreeText(text));
    expect(parsed.description).toBe(text);
    expect(parsed.notes).toBe(text);
    expect(parsed.steps).toEqual([text]);
    expect(parsed.ingredients[0].note).toBe(text);
  });

  it("free text is cleaned: invisible and control characters removed, ends trimmed", () => {
    const parsed = save(withFreeText("  Mix​ well\u0007‮  "));
    expect(parsed.description).toBe("Mix well");
    expect(parsed.notes).toBe("Mix well");
    expect(parsed.steps).toEqual(["Mix well"]);
    expect(parsed.ingredients[0].note).toBe("Mix well");
  });

  it("free text rejects 10,000 characters", () => {
    const long = "a".repeat(10_000);
    expect(check({ ...base, description: long }).success).toBe(false);
    expect(check({ ...base, notes: long }).success).toBe(false);
    expect(check(withSteps(long)).success).toBe(false);
    expect(check(editIngredient(base, { note: long })).success).toBe(false);
  });

  it.each<[string, (text: string) => RecipeFormValues, number]>([
    ["description", (text) => ({ ...base, description: text }), 500],
    ["notes", (text) => ({ ...base, notes: text }), 1000],
    ["a step", (text) => withSteps(text), 1000],
    ["an ingredient note", (text) => editIngredient(base, { note: text }), 100],
  ])("%s is accepted up to its limit and rejected past it", (_label, build, limit) => {
    expect(check(build("a".repeat(limit))).success).toBe(true);
    expect(check(build("a".repeat(limit + 1))).success).toBe(false);
  });

  it("an empty step is rejected, but empty description and notes are simply left out", () => {
    expect(check(withSteps("")).success).toBe(false);
    expect(check(withSteps("   ")).success).toBe(false);
    expect(check(withSteps("​")).success).toBe(false);
    expect(check({ ...base, description: "", notes: "   " }).success).toBe(true);
  });

  it.each([
    ["0", false],
    ["1", true],
    ["100", true],
    ["101", false],
    ["-1", false],
    ["2.5", false],
    ["", false],
    ["🍕", false],
  ])("servings %p -> %p", (servings, ok) => {
    expect(check({ ...base, servings }).success).toBe(ok);
  });

  it.each([
    [0, false],
    [1, true],
    [100, true],
    [101, false],
  ])("a title of %p characters -> %p", (length, ok) => {
    expect(check(withTitle("a".repeat(length))).success).toBe(ok);
  });

  it.each([
    ["0", false],
    ["0.01", true],
    ["100000", true],
    ["100001", false],
    ["-2", false],
  ])("ingredient quantity %p -> %p", (quantity, ok) => {
    expect(check(editIngredient(base, { quantity })).success).toBe(ok);
  });
});
