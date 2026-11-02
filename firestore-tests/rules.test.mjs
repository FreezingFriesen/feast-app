// Security Rules tests (Account Phase 6, item 3 in docs/PROJECT_PLAN.md).
// Every rule has an "allowed" and a "denied" test. Runs against the Firestore
// emulator with a demo- project, so nothing touches the real database:
//   npm run test:rules
// Needs Java (for the emulator). The first run downloads the emulator.
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-feast",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const asUser = (uid) => env.authenticatedContext(uid).firestore();
const signedOut = () => env.unauthenticatedContext().firestore();

// Writes test data without checking the rules.
async function seed(path, data) {
  await env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), path), data));
}

function newProfile(username, now = Date.now()) {
  return { username, dietaryRestrictions: null, createdAt: now, updatedAt: now, schemaVersion: 1 };
}

// What UsernameRegistry.claim does: both documents in one batch.
function claim(db, uid, username, profile = newProfile(username)) {
  const batch = writeBatch(db);
  batch.set(doc(db, "usernames", username), { uid });
  batch.set(doc(db, "users", uid), profile);
  return batch.commit();
}

async function seedAccount(uid, username) {
  const profile = newProfile(username);
  await seed(`usernames/${username}`, { uid });
  await seed(`users/${uid}`, profile);
  return profile;
}

describe("claiming a username (sign up)", () => {
  it("allows the profile and username together", async () => {
    await assertSucceeds(claim(asUser("alice"), "alice", "alice_1"));
  });

  it("denies the profile without the username", async () => {
    await assertFails(setDoc(doc(asUser("alice"), "users/alice"), newProfile("alice_1")));
  });

  it("denies the username without the profile", async () => {
    await assertFails(setDoc(doc(asUser("alice"), "usernames/alice_1"), { uid: "alice" }));
  });

  it("denies a username someone else owns", async () => {
    await seedAccount("bob", "taken_name");
    await assertFails(claim(asUser("alice"), "alice", "taken_name"));
  });

  it("denies a second username for a user who already has one", async () => {
    await seedAccount("alice", "alice_1");
    await assertFails(claim(asUser("alice"), "alice", "alice_2"));
  });

  it("denies claiming for another user", async () => {
    await assertFails(claim(asUser("alice"), "bob", "bob_1"));
  });

  it("denies signed-out users", async () => {
    await assertFails(claim(signedOut(), "alice", "alice_1"));
  });

  it("allows usernames of 3 and 20 characters", async () => {
    await assertSucceeds(claim(asUser("alice"), "alice", "abc"));
    await assertSucceeds(claim(asUser("bob"), "bob", "b".repeat(20)));
  });

  it("denies a username document with an extra field", async () => {
    const db = asUser("alice");
    const batch = writeBatch(db);
    batch.set(doc(db, "usernames", "alice_1"), { uid: "alice", isAdmin: true });
    batch.set(doc(db, "users", "alice"), newProfile("alice_1"));
    await assertFails(batch.commit());
  });

  for (const [label, username, profile] of [
    ["a username with capitals", "Alice", newProfile("Alice")],
    ["a username that is too short", "ab", newProfile("ab")],
    ["a username of 21 characters", "a".repeat(21), newProfile("a".repeat(21))],
    ["a profile username different from the claimed name", "alice_1", newProfile("alice_2")],
    ["updatedAt different from createdAt", "alice_1", { ...newProfile("alice_1"), updatedAt: Date.now() + 1000 }],
    ["an attack string as username", "a';drop", newProfile("a';drop")],
    ["an email in the profile", "alice_1", { ...newProfile("alice_1"), email: "a@b.com" }],
    ["restrictions set at sign up", "alice_1", { ...newProfile("alice_1"), dietaryRestrictions: { allergens: [], diets: [] } }],
    ["a createdAt far in the future", "alice_1", newProfile("alice_1", Date.now() + 86_400_000)],
    ["a createdAt before 2020", "alice_1", newProfile("alice_1", Date.UTC(2019, 0, 1))],
    ["a text timestamp", "alice_1", { ...newProfile("alice_1"), createdAt: "now", updatedAt: "now" }],
    ["schemaVersion 2", "alice_1", { ...newProfile("alice_1"), schemaVersion: 2 }],
    ["a missing field", "alice_1", { username: "alice_1", createdAt: Date.now(), updatedAt: Date.now(), schemaVersion: 1 }],
  ]) {
    it(`denies ${label}`, async () => {
      await assertFails(claim(asUser("alice"), "alice", username, profile));
    });
  }
});

describe("reading a profile", () => {
  it("allows the owner", async () => {
    await seedAccount("alice", "alice_1");
    await assertSucceeds(getDoc(doc(asUser("alice"), "users/alice")));
  });

  it("denies another user", async () => {
    await seedAccount("alice", "alice_1");
    await assertFails(getDoc(doc(asUser("bob"), "users/alice")));
  });

  it("denies signed-out users", async () => {
    await seedAccount("alice", "alice_1");
    await assertFails(getDoc(doc(signedOut(), "users/alice")));
  });

  it("denies listing all profiles", async () => {
    await assertFails(getDocs(collection(asUser("alice"), "users")));
  });
});

describe("updating a profile (dietary restrictions, N-18)", () => {
  const restrictions = { allergens: ["peanuts", "eggs"], diets: ["vegetarian"] };

  it("allows the owner to set valid restrictions", async () => {
    await seedAccount("alice", "alice_1");
    await assertSucceeds(
      updateDoc(doc(asUser("alice"), "users/alice"), { dietaryRestrictions: restrictions, updatedAt: Date.now() }),
    );
  });

  it("allows empty lists (the user chose none)", async () => {
    await seedAccount("alice", "alice_1");
    await assertSucceeds(
      updateDoc(doc(asUser("alice"), "users/alice"), { dietaryRestrictions: { allergens: [], diets: [] } }),
    );
  });

  it("denies another user", async () => {
    await seedAccount("alice", "alice_1");
    await assertFails(updateDoc(doc(asUser("bob"), "users/alice"), { dietaryRestrictions: restrictions }));
  });

  // Phone clocks can be wrong, so up to 5 minutes ahead of the server is accepted.
  it("allows updatedAt 4 minutes ahead", async () => {
    await seedAccount("alice", "alice_1");
    await assertSucceeds(updateDoc(doc(asUser("alice"), "users/alice"), { updatedAt: Date.now() + 4 * 60_000 }));
  });

  it("denies updatedAt more than 5 minutes ahead", async () => {
    await seedAccount("alice", "alice_1");
    await assertFails(updateDoc(doc(asUser("alice"), "users/alice"), { updatedAt: Date.now() + 6 * 60_000 }));
  });

  for (const [label, patch] of [
    ["an extra key in the restrictions", { dietaryRestrictions: { allergens: [], diets: [], notes: "x" } }],
    ["changing the username", { username: "new_name" }],
    ["changing createdAt", { createdAt: Date.UTC(2021, 0, 1) }],
    ["an allergen not on the list", { dietaryRestrictions: { allergens: ["gluten"], diets: [] } }],
    ["a duplicate allergen", { dietaryRestrictions: { allergens: ["eggs", "eggs"], diets: [] } }],
    ["a diet not on the list", { dietaryRestrictions: { allergens: [], diets: ["paleo"] } }],
    ["a missing list", { dietaryRestrictions: { allergens: [] } }],
    ["an extra field", { isAdmin: true }],
    ["updatedAt before createdAt", { updatedAt: Date.UTC(2020, 0, 2) }],
  ]) {
    it(`denies ${label}`, async () => {
      await seedAccount("alice", "alice_1");
      await assertFails(updateDoc(doc(asUser("alice"), "users/alice"), patch));
    });
  }
});

describe("deleting a profile (N-17)", () => {
  it("allows the owner", async () => {
    await seedAccount("alice", "alice_1");
    await assertSucceeds(deleteDoc(doc(asUser("alice"), "users/alice")));
  });

  it("denies another user", async () => {
    await seedAccount("alice", "alice_1");
    await assertFails(deleteDoc(doc(asUser("bob"), "users/alice")));
  });
});

describe("usernames", () => {
  it("allows anyone to look up one name", async () => {
    await seedAccount("alice", "alice_1");
    await assertSucceeds(getDoc(doc(signedOut(), "usernames/alice_1")));
    await assertSucceeds(getDoc(doc(signedOut(), "usernames/free_name")));
  });

  it("denies listing all names", async () => {
    await assertFails(getDocs(collection(signedOut(), "usernames")));
    await assertFails(getDocs(collection(asUser("alice"), "usernames")));
  });

  it("allows the owner to release their name", async () => {
    await seedAccount("alice", "alice_1");
    await assertSucceeds(deleteDoc(doc(asUser("alice"), "usernames/alice_1")));
  });

  it("allows releasing a name that is already free (retry)", async () => {
    await assertSucceeds(deleteDoc(doc(asUser("alice"), "usernames/alice_1")));
  });

  it("denies releasing someone else's name", async () => {
    await seedAccount("alice", "alice_1");
    await assertFails(deleteDoc(doc(asUser("bob"), "usernames/alice_1")));
  });

  it("denies changing the owner", async () => {
    await seedAccount("alice", "alice_1");
    await assertFails(setDoc(doc(asUser("bob"), "usernames/alice_1"), { uid: "bob" }));
  });
});

// Synced content (N-19). The fixtures are shaped like the repositories' records.
const RECIPE = "users/alice/recipes/pancakes-1";
const ENTRY = "users/alice/mealPlanEntries/entry-1";
const ATTACKS = ["'; DROP TABLE recipes;--", "<script>alert(1)</script>"];

function newRecipe(now = Date.now()) {
  return {
    title: "Pancakes",
    servings: 2,
    mealTypes: ["breakfast"],
    ingredients: [{ name: "Flour", quantity: 200, unit: "g" }],
    steps: ["Mix", "Cook"],
    dietTags: ["vegetarian"],
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  };
}

function newEntry(now = Date.now()) {
  return {
    date: "2026-11-02",
    mealType: "dinner",
    recipeId: "pancakes-1",
    servings: 2,
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  };
}

const without = (data, key) => Object.fromEntries(Object.entries(data).filter(([name]) => name !== key));

describe("other collections under users/{uid}", () => {
  for (const path of [
    "users/alice/notes/x",
    "users/alice/settings/x",
    "users/alice/recipesBackup/x",
    "users/alice/recipes/pancakes-1/comments/x",
    "users/alice/mealPlanEntries/entry-1/extra/x",
  ]) {
    it(`denies the owner reading or writing ${path}`, async () => {
      await assertFails(setDoc(doc(asUser("alice"), path), { title: "Pancakes" }));
      await seed(path, { title: "Pancakes" });
      await assertFails(getDoc(doc(asUser("alice"), path)));
      await assertFails(deleteDoc(doc(asUser("alice"), path)));
    });
  }

  it("denies listing another collection", async () => {
    await assertFails(getDocs(collection(asUser("alice"), "users/alice/notes")));
  });
});

describe("recipes", () => {
  it("allows the owner to create, read, list, update and delete", async () => {
    const db = asUser("alice");
    await assertSucceeds(setDoc(doc(db, RECIPE), newRecipe()));
    await assertSucceeds(getDoc(doc(db, RECIPE)));
    await assertSucceeds(getDocs(collection(db, "users/alice/recipes")));
    await assertSucceeds(updateDoc(doc(db, RECIPE), { title: "Crêpes", updatedAt: Date.now() }));
    await assertSucceeds(deleteDoc(doc(db, RECIPE)));
  });

  it("allows every optional field", async () => {
    const now = Date.now();
    await assertSucceeds(
      setDoc(doc(asUser("alice"), RECIPE), {
        ...newRecipe(now),
        description: "Fluffy",
        prepTimeMinutes: 0,
        cookTimeMinutes: 1440,
        notes: "Serve warm",
        allergens: ["milk", "eggs", "wheat"],
        mealTypes: ["breakfast", "lunch", "dinner", "snack"],
        dietTags: ["vegan", "vegetarian", "pescatarian", "keto_friendly", "gluten_free", "dairy_free"],
        deletedAt: now,
      }),
    );
  });

  it("allows an ID from newId() and the ID_PATTERN characters", async () => {
    await assertSucceeds(setDoc(doc(asUser("alice"), "users/alice/recipes/mhx3k2ab-4fzyq0lm"), newRecipe()));
    await assertSucceeds(setDoc(doc(asUser("alice"), `users/alice/recipes/${"a_-".repeat(33)}a`), newRecipe()));
  });

  for (const title of ["Crème brûlée", "Mom’s Mac & Cheese (50/50)", "100% Whole-wheat bread!", "Pasta, garlic + oil", "a".repeat(100), "é".repeat(100)]) {
    it(`allows the title ${JSON.stringify(title.slice(0, 30))}`, async () => {
      await assertSucceeds(setDoc(doc(asUser("alice"), RECIPE), { ...newRecipe(), title }));
    });
  }

  for (const [label, title] of [
    ["101 characters", "a".repeat(101)],
    ["empty", ""],
    ["an emoji", "🍕 Pizza"],
    ["a zero-width space", "Pan​cakes"],
    ["a right-to-left override", "‮Pancakes"],
    ["a new line", "Pan\ncakes"],
    ...ATTACKS.map((attack) => [attack, attack]),
  ]) {
    it(`denies a title with ${label}`, async () => {
      await assertFails(setDoc(doc(asUser("alice"), RECIPE), { ...newRecipe(), title }));
    });
  }

  it("stores attack strings in free text as plain text", async () => {
    await seed("users/alice/recipes/waffles-1", newRecipe());
    const db = asUser("alice");
    for (const [index, attack] of ATTACKS.entries()) {
      const recipe = { ...newRecipe(), description: attack, steps: [attack], notes: attack };
      await assertSucceeds(setDoc(doc(db, `users/alice/recipes/attack-${index}`), recipe));
      const stored = await assertSucceeds(getDoc(doc(db, `users/alice/recipes/attack-${index}`)));
      assert.deepEqual(stored.data(), recipe);
    }
    // Nothing else was touched.
    const all = await assertSucceeds(getDocs(collection(db, "users/alice/recipes")));
    assert.deepEqual(all.docs.map((d) => d.id).sort(), ["attack-0", "attack-1", "waffles-1"]);
  });

  // Zod counts code points, so an emoji (two UTF-16 units, four UTF-8 bytes) is one
  // character. The Rules' size() counts UTF-16 units, so validText uses a regex.
  for (const [label, patch, ok] of [
    ["a description of 500 emoji", { description: "😀".repeat(500) }, true],
    ["a description of 501 emoji", { description: "😀".repeat(501) }, false],
    ["notes of 1000 emoji", { notes: "😀".repeat(1000) }, true],
    ["notes of 1001 emoji", { notes: "😀".repeat(1001) }, false],
    ["a description of 500 accented letters", { description: "é".repeat(500) }, true],
    ["a description of 500 characters with new lines", { description: "a\n".repeat(250) }, true],
    ["a description of 501 characters with new lines", { description: `${"a\n".repeat(250)}a` }, false],
    ["a title of 100 letters outside the BMP", { title: "𠀀".repeat(100) }, true],
    ["a title of 101 letters outside the BMP", { title: "𠀀".repeat(101) }, false],
  ]) {
    it(`${ok ? "allows" : "denies"} ${label} (counted like Zod)`, async () => {
      const write = setDoc(doc(asUser("alice"), RECIPE), { ...newRecipe(), ...patch });
      await (ok ? assertSucceeds(write) : assertFails(write));
    });
  }

  for (const [label, patch] of [
    ["servings 1", { servings: 1 }],
    ["servings 100", { servings: 100 }],
    ["no prep or cook time", {}],
    ["a prep time of 1440", { prepTimeMinutes: 1440 }],
    ["an empty description", { description: "" }],
    ["50 ingredients", { ingredients: Array(50).fill({ name: "Flour", quantity: 1, unit: "g" }) }],
    ["50 steps", { steps: Array(50).fill("Stir") }],
    ["empty tag lists", { mealTypes: [], dietTags: [] }],
    ["an empty allergen list", { allergens: [] }],
  ]) {
    it(`allows ${label}`, async () => {
      await assertSucceeds(setDoc(doc(asUser("alice"), RECIPE), { ...newRecipe(), ...patch }));
    });
  }

  for (const [label, patch] of [
    ["an id field (the id is the document ID)", { id: "pancakes-1" }],
    ["an unknown field", { isAdmin: true }],
    ["a source (not in recipeSchema yet)", { source: { type: "manual" } }],
    ["servings 0", { servings: 0 }],
    ["servings 101", { servings: 101 }],
    ["servings 2.5", { servings: 2.5 }],
    ["servings as text", { servings: "2" }],
    ["a negative prep time", { prepTimeMinutes: -1 }],
    ["a cook time of 1441", { cookTimeMinutes: 1441 }],
    ["a cook time of 1.5", { cookTimeMinutes: 1.5 }],
    ["a description of 501 characters", { description: "a".repeat(501) }],
    ["a description that is not text", { description: 5 }],
    ["notes of 1001 characters", { notes: "a".repeat(1001) }],
    ["a null optional field", { notes: null }],
    ["a title that is not text", { title: 5 }],
    ["no ingredients", { ingredients: [] }],
    ["51 ingredients", { ingredients: Array(51).fill({ name: "Flour", quantity: 1, unit: "g" }) }],
    ["ingredients that are not a list", { ingredients: "flour" }],
    ["no steps", { steps: [] }],
    ["51 steps", { steps: Array(51).fill("Stir") }],
    ["steps that are not a list", { steps: "Mix" }],
    ["a meal type not on the list", { mealTypes: ["brunch"] }],
    ["a meal type with capitals", { mealTypes: ["Breakfast"] }],
    ["a duplicate meal type", { mealTypes: ["lunch", "lunch"] }],
    ["meal types that are not a list", { mealTypes: "breakfast" }],
    ["a diet tag not on the list", { dietTags: ["paleo"] }],
    ["a duplicate diet tag", { dietTags: ["vegan", "vegan"] }],
    ["an allergen not on the list", { allergens: ["gluten"] }],
    ["a duplicate allergen", { allergens: ["milk", "milk"] }],
    ["schemaVersion 2", { schemaVersion: 2 }],
    ["a createdAt before 2020", { createdAt: Date.UTC(2019, 0, 1) }],
    ["a createdAt far in the future", { createdAt: Date.now() + 86_400_000, updatedAt: Date.now() + 86_400_000 }],
    ["updatedAt before createdAt", { updatedAt: Date.UTC(2020, 0, 2) }],
    ["a text timestamp", { updatedAt: "now" }],
    ["a text deletedAt", { deletedAt: "yes" }],
  ]) {
    it(`denies ${label}`, async () => {
      await assertFails(setDoc(doc(asUser("alice"), RECIPE), { ...newRecipe(), ...patch }));
    });
  }

  for (const field of Object.keys(newRecipe())) {
    it(`denies a recipe without ${field}`, async () => {
      await assertFails(setDoc(doc(asUser("alice"), RECIPE), without(newRecipe(), field)));
    });
  }

  for (const id of ["Pancakes-1", "pancakes 1", "pancakes.1", "a".repeat(101)]) {
    it(`denies the document ID ${JSON.stringify(id.slice(0, 20))}`, async () => {
      await assertFails(setDoc(doc(asUser("alice"), `users/alice/recipes/${id}`), newRecipe()));
    });
  }

  it("allows a soft delete, and keeping deletedAt on later updates", async () => {
    await seed(RECIPE, newRecipe(Date.now() - 60_000));
    const db = asUser("alice");
    const deletedAt = Date.now();
    await assertSucceeds(updateDoc(doc(db, RECIPE), { deletedAt, updatedAt: deletedAt }));
    await assertSucceeds(updateDoc(doc(db, RECIPE), { title: "Crêpes", updatedAt: deletedAt }));
  });

  for (const [label, patch] of [
    ["changing createdAt", { createdAt: Date.UTC(2021, 0, 1) }],
    ["an invalid value", { servings: 0 }],
    ["an unknown field", { isAdmin: true }],
  ]) {
    it(`denies an update with ${label}`, async () => {
      await seed(RECIPE, newRecipe());
      await assertFails(updateDoc(doc(asUser("alice"), RECIPE), patch));
    });
  }

  it("denies bringing a soft-deleted recipe back", async () => {
    const now = Date.now();
    await seed(RECIPE, { ...newRecipe(now), deletedAt: now });
    const db = asUser("alice");
    await assertFails(setDoc(doc(db, RECIPE), newRecipe(now)));
    await assertFails(updateDoc(doc(db, RECIPE), { deletedAt: now + 1, updatedAt: now + 1 }));
  });

  it("denies another user", async () => {
    await seed(RECIPE, newRecipe());
    const db = asUser("bob");
    await assertFails(getDoc(doc(db, RECIPE)));
    await assertFails(getDocs(collection(db, "users/alice/recipes")));
    await assertFails(setDoc(doc(db, "users/alice/recipes/waffles-1"), newRecipe()));
    await assertFails(updateDoc(doc(db, RECIPE), { title: "Mine now" }));
    await assertFails(deleteDoc(doc(db, RECIPE)));
  });

  it("denies signed-out users", async () => {
    await seed(RECIPE, newRecipe());
    const db = signedOut();
    await assertFails(getDoc(doc(db, RECIPE)));
    await assertFails(getDocs(collection(db, "users/alice/recipes")));
    await assertFails(setDoc(doc(db, "users/alice/recipes/waffles-1"), newRecipe()));
    await assertFails(updateDoc(doc(db, RECIPE), { title: "Mine now" }));
    await assertFails(deleteDoc(doc(db, RECIPE)));
  });
});

describe("meal plan entries", () => {
  it("allows the owner to create, read, list, move, soft delete and delete", async () => {
    const db = asUser("alice");
    await assertSucceeds(setDoc(doc(db, ENTRY), newEntry()));
    await assertSucceeds(getDoc(doc(db, ENTRY)));
    await assertSucceeds(getDocs(collection(db, "users/alice/mealPlanEntries")));
    await assertSucceeds(
      updateDoc(doc(db, ENTRY), { date: "2026-11-03", mealType: "lunch", servings: 4, updatedAt: Date.now() }),
    );
    const deletedAt = Date.now();
    await assertSucceeds(updateDoc(doc(db, ENTRY), { deletedAt, updatedAt: deletedAt }));
    await assertSucceeds(deleteDoc(doc(db, ENTRY)));
  });

  for (const [label, patch] of [
    ["the first day", { date: "2000-01-01" }],
    ["the last day", { date: "2100-12-31" }],
    ["29 Feb 2000 (a leap year)", { date: "2000-02-29" }],
    ["29 Feb 2024", { date: "2024-02-29" }],
    ["31 Dec", { date: "2026-12-31" }],
    ["breakfast", { mealType: "breakfast" }],
    ["servings 1", { servings: 1 }],
    ["servings 100", { servings: 100 }],
    ["a newId() recipe ID", { recipeId: "mhx3k2ab-4fzyq0lm" }],
  ]) {
    it(`allows ${label}`, async () => {
      await assertSucceeds(setDoc(doc(asUser("alice"), ENTRY), { ...newEntry(), ...patch }));
    });
  }

  for (const [label, patch] of [
    ["30 Feb", { date: "2026-02-30" }],
    ["29 Feb in a common year", { date: "2026-02-29" }],
    ["29 Feb 2100 (not a leap year)", { date: "2100-02-29" }],
    ["31 Apr", { date: "2026-04-31" }],
    ["month 13", { date: "2026-13-01" }],
    ["month 00", { date: "2026-00-10" }],
    ["day 00", { date: "2026-10-00" }],
    ["a date before 2000", { date: "1999-12-31" }],
    ["a date after 2100", { date: "2101-01-01" }],
    ["a date without leading zeros", { date: "2026-1-5" }],
    ["a date without dashes", { date: "20261019" }],
    ["a date with a time", { date: "2026-10-19T00:00" }],
    ["a date with full-width digits", { date: "２０２６-１０-１９" }],
    ["a date as a number", { date: 20261019 }],
    ["the snack meal type (a recipe tag only)", { mealType: "snack" }],
    ["a meal type with capitals", { mealType: "Dinner" }],
    ["a recipe ID with capitals", { recipeId: "Pancakes-1" }],
    ["a recipe ID with a slash", { recipeId: "a/b" }],
    ["an empty recipe ID", { recipeId: "" }],
    ["a recipe ID of 101 characters", { recipeId: "a".repeat(101) }],
    ...ATTACKS.map((attack) => [`the recipe ID ${attack}`, { recipeId: attack }]),
    ["servings 0", { servings: 0 }],
    ["servings 101", { servings: 101 }],
    ["servings 1.5", { servings: 1.5 }],
    ["servings as text", { servings: "2" }],
    ["an id field", { id: "entry-1" }],
    ["a copy of the recipe", { title: "Pancakes" }],
    ["schemaVersion 2", { schemaVersion: 2 }],
    ["a createdAt far in the future", { createdAt: Date.now() + 86_400_000, updatedAt: Date.now() + 86_400_000 }],
    ["a text deletedAt", { deletedAt: "yes" }],
  ]) {
    it(`denies ${label}`, async () => {
      await assertFails(setDoc(doc(asUser("alice"), ENTRY), { ...newEntry(), ...patch }));
    });
  }

  for (const field of Object.keys(newEntry())) {
    it(`denies an entry without ${field}`, async () => {
      await assertFails(setDoc(doc(asUser("alice"), ENTRY), without(newEntry(), field)));
    });
  }

  for (const id of ["Entry-1", "entry 1", "a".repeat(101)]) {
    it(`denies the document ID ${JSON.stringify(id.slice(0, 20))}`, async () => {
      await assertFails(setDoc(doc(asUser("alice"), `users/alice/mealPlanEntries/${id}`), newEntry()));
    });
  }

  for (const [label, patch] of [
    ["changing the recipe", { recipeId: "waffles-1" }],
    ["changing createdAt", { createdAt: Date.UTC(2021, 0, 1) }],
    ["an invalid date", { date: "2026-02-30" }],
  ]) {
    it(`denies an update with ${label}`, async () => {
      await seed(ENTRY, newEntry());
      await assertFails(updateDoc(doc(asUser("alice"), ENTRY), patch));
    });
  }

  it("denies bringing a soft-deleted entry back", async () => {
    const now = Date.now();
    await seed(ENTRY, { ...newEntry(now), deletedAt: now });
    const db = asUser("alice");
    await assertFails(setDoc(doc(db, ENTRY), newEntry(now)));
    await assertFails(updateDoc(doc(db, ENTRY), { deletedAt: now + 1, updatedAt: now + 1 }));
    await assertSucceeds(updateDoc(doc(db, ENTRY), { servings: 3 }));
  });

  it("denies another user", async () => {
    await seed(ENTRY, newEntry());
    const db = asUser("bob");
    await assertFails(getDoc(doc(db, ENTRY)));
    await assertFails(getDocs(collection(db, "users/alice/mealPlanEntries")));
    await assertFails(setDoc(doc(db, "users/alice/mealPlanEntries/entry-2"), newEntry()));
    await assertFails(updateDoc(doc(db, ENTRY), { servings: 3 }));
    await assertFails(deleteDoc(doc(db, ENTRY)));
  });

  it("denies signed-out users", async () => {
    await seed(ENTRY, newEntry());
    const db = signedOut();
    await assertFails(getDoc(doc(db, ENTRY)));
    await assertFails(getDocs(collection(db, "users/alice/mealPlanEntries")));
    await assertFails(setDoc(doc(db, "users/alice/mealPlanEntries/entry-2"), newEntry()));
    await assertFails(updateDoc(doc(db, ENTRY), { servings: 3 }));
    await assertFails(deleteDoc(doc(db, ENTRY)));
  });
});

describe("ingredients", () => {
  it("allows signed-in users to read", async () => {
    await seed("ingredients/all_purpose_flour", { name: "All-purpose flour" });
    await assertSucceeds(getDoc(doc(asUser("alice"), "ingredients/all_purpose_flour")));
    await assertSucceeds(getDocs(collection(asUser("alice"), "ingredients")));
  });

  it("denies signed-out users", async () => {
    await seed("ingredients/all_purpose_flour", { name: "All-purpose flour" });
    await assertFails(getDoc(doc(signedOut(), "ingredients/all_purpose_flour")));
  });

  it("denies writes from the app", async () => {
    await assertFails(setDoc(doc(asUser("alice"), "ingredients/x"), { name: "x" }));
    await seed("ingredients/all_purpose_flour", { name: "All-purpose flour" });
    await assertFails(updateDoc(doc(asUser("alice"), "ingredients/all_purpose_flour"), { name: "y" }));
    await assertFails(deleteDoc(doc(asUser("alice"), "ingredients/all_purpose_flour")));
  });
});
