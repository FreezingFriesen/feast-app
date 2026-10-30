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

  for (const [label, username, profile] of [
    ["a username with capitals", "Alice", newProfile("Alice")],
    ["a username that is too short", "ab", newProfile("ab")],
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

  for (const [label, patch] of [
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

describe("recipes and meal plan entries", () => {
  it("allows the owner to write and read", async () => {
    await seedAccount("alice", "alice_1");
    const db = asUser("alice");
    await assertSucceeds(setDoc(doc(db, "users/alice/recipes/pancakes-1"), { title: "Pancakes" }));
    await assertSucceeds(getDoc(doc(db, "users/alice/recipes/pancakes-1")));
    await assertSucceeds(setDoc(doc(db, "users/alice/mealPlanEntries/entry-1"), { servings: 2 }));
  });

  it("denies another user", async () => {
    await seed("users/alice/recipes/pancakes-1", { title: "Pancakes" });
    await assertFails(getDoc(doc(asUser("bob"), "users/alice/recipes/pancakes-1")));
    await assertFails(setDoc(doc(asUser("bob"), "users/alice/recipes/x"), { title: "x" }));
  });

  it("denies signed-out users", async () => {
    await seed("users/alice/recipes/pancakes-1", { title: "Pancakes" });
    await assertFails(getDoc(doc(signedOut(), "users/alice/recipes/pancakes-1")));
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
