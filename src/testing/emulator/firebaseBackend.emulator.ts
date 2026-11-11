/// <reference types="node" />
// What only the real services and the real Security Rules together can prove.
import { createInMemoryProfileRepository } from "@/repositories/inMemoryProfileRepository";
import { createAccountDeleter, type AccountDeletionStep } from "@/services/account/AccountDeleter";
import { createLocalDataWiper } from "@/services/account/LocalDataWiper";
import { createSignUpFlow } from "@/services/account/signUpFlow";
import { createSecureSessionStore } from "@/services/session/SecureSessionStore";
import { createSessionGuard } from "@/services/session/sessionGuard";
import { createSessionPolicy } from "@/services/session/SessionPolicy";
import { storedProfileSchema } from "@/validation/profileSchema";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  disableNetwork,
  doc,
  getDocFromServer,
  getDocsFromServer,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { readFileSync } from "node:fs";
import { createFirebaseHarness, EMULATOR_PROJECT_ID } from "../contracts/firebaseHarness";
import { createMemorySecureKeyValue } from "../fakes/memorySecureKeyValue";

const PASSWORD = "correct horse battery";
const harness = createFirebaseHarness();
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: EMULATOR_PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await harness.dispose();
  await env.cleanup();
});

// Reads and writes the database directly, without the rules, to set up or check a test.
async function rawDoc(path: string) {
  let snapshot!: Awaited<ReturnType<typeof getDocFromServer>>;
  await env.withSecurityRulesDisabled(async (context) => {
    snapshot = await getDocFromServer(doc(context.firestore(), path));
  });
  return snapshot;
}

async function rawCount(path: string) {
  let size = 0;
  await env.withSecurityRulesDisabled(async (context) => {
    size = (await getDocsFromServer(collection(context.firestore(), path))).size;
  });
  return size;
}

async function seedMany(collectionPath: string, count: number) {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (let start = 0; start < count; start += 400) {
      const batch = writeBatch(db);
      for (let i = start; i < Math.min(start + 400, count); i += 1) {
        batch.set(doc(db, `${collectionPath}/doc-${i}`), { title: `Item ${i}` });
      }
      await batch.commit();
    }
  });
}

const seedDoc = (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), path), data));

// A signed-up user on their own "phone".
async function signedUpUser(options?: Parameters<typeof harness.createBackend>[0]) {
  const backend = harness.createBackend(options);
  const email = harness.uniqueEmail();
  const result = await backend.auth.signUp({ email, password: PASSWORD });
  if (!result.ok) throw new Error(`Sign up failed: ${result.error}`);
  return { ...backend, email, uid: result.user.uid };
}

async function userWithName(options?: Parameters<typeof harness.createBackend>[0]) {
  const user = await signedUpUser(options);
  const username = harness.uniqueUsername();
  const claim = await user.usernames.claim(user.uid, username);
  if (!claim.ok) throw new Error(`Claim failed: ${claim.reason}`);
  return { ...user, username, profile: claim.profile };
}

describe("two accounts claiming the same name at the same moment", () => {
  it.each([1, 2, 3, 4, 5])("exactly one wins, and the loser has no profile (round %i)", async () => {
    const [first, second] = await Promise.all([signedUpUser(), signedUpUser()]);
    const name = harness.uniqueUsername();

    const results = await Promise.all([first.usernames.claim(first.uid, name), second.usernames.claim(second.uid, name)]);

    const winners = results.filter((result) => result.ok);
    expect(winners).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toEqual({ ok: false, reason: "taken" });

    const [winner, loser] = results[0].ok ? [first, second] : [second, first];
    expect((await rawDoc(`usernames/${name}`)).data()).toEqual({ uid: winner.uid });
    expect((await rawDoc(`users/${winner.uid}`)).exists()).toBe(true);
    expect((await rawDoc(`users/${loser.uid}`)).exists()).toBe(false);
  });
});

describe("the full account deletion", () => {
  // A signed-up user with synced content, and a deleter wired as in useAccountFlows.
  async function setup(overrides: { failOnce?: AccountDeletionStep } = {}) {
    const backend = harness.createBackend();
    const profiles = createInMemoryProfileRepository();
    const secure = createMemorySecureKeyValue();
    const store = createSecureSessionStore(secure.store);
    const localData = createLocalDataWiper([profiles]);
    const sessionGuard = createSessionGuard({ auth: backend.auth, store, policy: createSessionPolicy(), wiper: localData });
    const signUpFlow = createSignUpFlow({ ...backend, profiles, sessionGuard });

    const email = harness.uniqueEmail();
    const username = harness.uniqueUsername();
    const signedUp = await signUpFlow.signUp({ email, username, password: PASSWORD, confirmPassword: PASSWORD });
    expect(signedUp).toEqual({ status: "signed_up" });
    const uid = backend.auth.currentUser()!.uid;
    await seedMany(`users/${uid}/recipes`, 3);
    await seedMany(`users/${uid}/mealPlanEntries`, 2);

    // Fails one chosen step once, as if the connection dropped there.
    let armed = overrides.failOnce;
    const offlineOnce = <T,>(step: AccountDeletionStep, real: () => Promise<T>, offline: T) => {
      if (armed !== step) return real();
      armed = undefined;
      return Promise.resolve(offline);
    };
    const deleter = createAccountDeleter({
      auth: {
        ...backend.auth,
        deleteAuthUser: () =>
          offlineOnce("delete_auth_user", () => backend.auth.deleteAuthUser(), { ok: false, error: "offline" } as const),
      },
      usernames: {
        ...backend.usernames,
        release: (...args) =>
          offlineOnce("release_username", () => backend.usernames.release(...args), {
            ok: false,
            reason: "offline",
          } as const),
      },
      remoteProfiles: {
        ...backend.remoteProfiles,
        delete: (...args) =>
          offlineOnce("delete_profile", () => backend.remoteProfiles.delete(...args), {
            ok: false,
            reason: "offline",
          } as const),
      },
      remoteContent: {
        deleteAll: (...args) =>
          offlineOnce("delete_data", () => backend.remoteContent.deleteAll(...args), {
            ok: false,
            reason: "offline",
          } as const),
      },
      profiles,
      sessionGuard,
      localData,
      // No sync engine in this test; sync.emulator.ts covers deletion with one.
      sync: { stop: async () => {} },
    });
    return { ...backend, deleter, profiles, secure, email, username, uid };
  }

  type Context = Awaited<ReturnType<typeof setup>>;

  async function expectNothingLeft({ auth, email, username, uid, profiles, secure }: Context) {
    expect((await rawDoc(`users/${uid}`)).exists()).toBe(false);
    expect((await rawDoc(`usernames/${username}`)).exists()).toBe(false);
    expect(await rawCount(`users/${uid}/recipes`)).toBe(0);
    expect(await rawCount(`users/${uid}/mealPlanEntries`)).toBe(0);
    expect(auth.currentUser()).toBeNull();
    expect(await auth.signIn({ email, password: PASSWORD })).toEqual({ ok: false, error: "invalid_credentials" });
    expect(await profiles.get(uid)).toBeUndefined();
    expect(secure.items.size).toBe(0);
  }

  it("leaves nothing in users, usernames, recipes or mealPlanEntries", async () => {
    const context = await setup();
    expect(await context.deleter.deleteAccount({ password: PASSWORD, confirmation: context.username })).toEqual({
      ok: true,
    });
    await expectNothingLeft(context);
  });

  it.each(["delete_data", "release_username", "delete_profile", "delete_auth_user"] as const)(
    "a retry finishes after a failure at %s",
    async (failOnce) => {
      const context = await setup({ failOnce });
      const input = { password: PASSWORD, confirmation: context.username };
      expect(await context.deleter.deleteAccount(input)).toEqual({ ok: false, failedStep: failOnce, error: "offline" });
      expect(await context.deleter.deleteAccount(input)).toEqual({ ok: true });
      await expectNothingLeft(context);
    },
  );

  it("refuses to delete a profile while its owner still holds the username", async () => {
    const user = await userWithName();
    expect(await user.remoteProfiles.delete(user.uid)).toEqual({ ok: false, reason: "not_owner" });
    expect((await rawDoc(`users/${user.uid}`)).exists()).toBe(true);
  });
});

describe("deleteAll", () => {
  it("deletes 1,200 recipes across several batches", async () => {
    const user = await signedUpUser();
    await seedMany(`users/${user.uid}/recipes`, 1_200);
    await seedMany(`users/${user.uid}/mealPlanEntries`, 5);

    expect(await user.remoteContent.deleteAll(user.uid)).toEqual({ ok: true });
    expect(await rawCount(`users/${user.uid}/recipes`)).toBe(0);
    expect(await rawCount(`users/${user.uid}/mealPlanEntries`)).toBe(0);
    // Running it again is safe.
    expect(await user.remoteContent.deleteAll(user.uid)).toEqual({ ok: true });
  });
});

describe("a second signed-in user", () => {
  async function setup() {
    const owner = await userWithName();
    await seedMany(`users/${owner.uid}/recipes`, 2);
    const intruder = await signedUpUser();
    return { owner, intruder };
  }

  it("can't read or write the first user's data through the services", async () => {
    const { owner, intruder } = await setup();
    const refused = { ok: false, reason: "not_owner" };

    expect(await intruder.remoteProfiles.fetch(owner.uid)).toEqual(refused);
    expect(await intruder.remoteProfiles.delete(owner.uid)).toEqual(refused);
    expect(await intruder.remoteContent.deleteAll(owner.uid)).toEqual(refused);
    expect(await intruder.usernames.claim(owner.uid, harness.uniqueUsername())).toEqual(refused);
    expect(await intruder.usernames.release(owner.uid, owner.username)).toEqual(refused);
    expect(await intruder.usernames.release(intruder.uid, owner.username)).toEqual(refused);

    expect((await rawDoc(`users/${owner.uid}`)).data()).toEqual(owner.profile);
    expect((await rawDoc(`usernames/${owner.username}`)).data()).toEqual({ uid: owner.uid });
    expect(await rawCount(`users/${owner.uid}/recipes`)).toBe(2);
  });

  it("is stopped by the Security Rules themselves, not just the services", async () => {
    const { owner, intruder } = await setup();
    const db = intruder.client.db;
    const denied = expect.objectContaining({ code: "permission-denied" });

    await expect(getDocFromServer(doc(db, "users", owner.uid))).rejects.toEqual(denied);
    await expect(setDoc(doc(db, "users", owner.uid), owner.profile)).rejects.toEqual(denied);
    await expect(deleteDoc(doc(db, "users", owner.uid))).rejects.toEqual(denied);
    await expect(getDocsFromServer(collection(db, "users", owner.uid, "recipes"))).rejects.toEqual(denied);
    await expect(deleteDoc(doc(db, "users", owner.uid, "recipes", "doc-0"))).rejects.toEqual(denied);
    await expect(deleteDoc(doc(db, "usernames", owner.username))).rejects.toEqual(denied);
  });
});

describe("ingredients", () => {
  it("a signed-in client can read them but not write them, and a signed-out client can't read them", async () => {
    await seedDoc("ingredients/test_flour", { name: "Flour" });
    const user = await signedUpUser();
    const denied = expect.objectContaining({ code: "permission-denied" });

    const snapshot = await getDocFromServer(doc(user.client.db, "ingredients", "test_flour"));
    expect(snapshot.data()).toEqual({ name: "Flour" });
    await expect(setDoc(doc(user.client.db, "ingredients", "test_flour"), { name: "Changed" })).rejects.toEqual(denied);
    await expect(deleteDoc(doc(user.client.db, "ingredients", "test_flour"))).rejects.toEqual(denied);
    expect((await rawDoc("ingredients/test_flour")).data()).toEqual({ name: "Flour" });

    await user.auth.signOut();
    await expect(getDocFromServer(doc(user.client.db, "ingredients", "test_flour"))).rejects.toEqual(denied);
  });
});

describe("a stored profile", () => {
  it("comes back through storedProfileSchema unchanged", async () => {
    const user = await userWithName();
    const profile = {
      ...user.profile,
      dietaryRestrictions: { allergens: ["peanuts", "sesame"], diets: ["vegan", "gluten_free"] },
      updatedAt: user.profile.updatedAt + 1,
    };
    // The update path the sync engine uses, so the Security Rules check it too.
    await setDoc(doc(user.client.db, "users", user.uid), profile);

    expect(storedProfileSchema.parse((await rawDoc(`users/${user.uid}`)).data())).toEqual(profile);
    expect(await user.remoteProfiles.fetch(user.uid)).toEqual({ ok: true, profile });
  });

  it("is reported as unknown if the stored document is invalid", async () => {
    const user = await userWithName();
    await seedDoc(`users/${user.uid}`, { ...user.profile, username: "Not Valid!" });
    expect(await user.remoteProfiles.fetch(user.uid)).toEqual({ ok: false, reason: "unknown" });
  });

  it("drops fields that aren't part of a profile", async () => {
    const user = await userWithName();
    await seedDoc(`users/${user.uid}`, { ...user.profile, isAdmin: true });
    expect(await user.remoteProfiles.fetch(user.uid)).toEqual({ ok: true, profile: user.profile });
  });
});

describe("with no connection (the SDK queues writes and answers lists from its cache)", () => {
  // The phone says it's online, but no request can get through, like a captive portal.
  const TIMEOUT = { timeoutMs: 1_000 };

  it("calls report offline instead of hanging", async () => {
    const user = await userWithName(TIMEOUT);
    await disableNetwork(user.client.db);
    const offline = { ok: false, reason: "offline" };

    expect(await user.usernames.isAvailable(harness.uniqueUsername())).toBe("offline");
    expect(await user.remoteProfiles.fetch(user.uid)).toEqual(offline);
    expect(await user.usernames.release(user.uid, user.username)).toEqual(offline);
    expect(await user.remoteProfiles.delete(user.uid)).toEqual(offline);
  });

  it("claiming a name reports offline instead of hanging, and claims nothing", async () => {
    // A transaction goes straight to the server, past disableNetwork, so this phone's
    // Firestore points where nothing answers instead.
    const user = await signedUpUser({ ...TIMEOUT, firestoreReachable: false });
    const name = harness.uniqueUsername();
    expect(await user.usernames.claim(user.uid, name)).toEqual({ ok: false, reason: "offline" });
    expect((await rawDoc(`usernames/${name}`)).exists()).toBe(false);
  });

  it("deleteAll doesn't report success when nothing was deleted", async () => {
    const user = await signedUpUser(TIMEOUT);
    await seedMany(`users/${user.uid}/recipes`, 2);
    await disableNetwork(user.client.db);

    expect(await user.remoteContent.deleteAll(user.uid)).toEqual({ ok: false, reason: "offline" });
    expect(await rawCount(`users/${user.uid}/recipes`)).toBe(2);
  });
});
