import { createMemorySecureKeyValue, SECURE_STORE_VALUE_LIMIT_BYTES, utf8Length } from "@/testing/fakes/memorySecureKeyValue";
import { MAX_SESSION_CHUNKS, MAX_SESSION_ITEMS, SESSION_CHUNK_LENGTH } from "@/validation/authSchema";
import { SECURE_KEY_PATTERN } from "@/validation/patterns";
import { createChunkedSecureStorage, encodeKey, splitIntoChunks } from "../chunkedSecureStorage";

const PREFIX = "test";
const FIREBASE_KEY = "firebase:authUser:AIzaSyA-1234567890abcdefghijklmnopqrstu:[DEFAULT]";

// Roughly what Firebase Auth stores for a signed-in user (about 2.5 KB).
const FIREBASE_VALUE = JSON.stringify({
  uid: "Xy3kP9qLmN2vB7cD1eF4gH6jK8l0",
  email: "levi@example.com",
  emailVerified: false,
  providerData: [{ providerId: "password", uid: "levi@example.com", email: "levi@example.com" }],
  stsTokenManager: {
    refreshToken: "AMf-vB".padEnd(300, "r"),
    accessToken: "eyJhbGciOiJSUzI1NiJ9.".padEnd(1100, "a"),
    expirationTime: 1761181200000,
  },
  createdAt: "1759300000000",
  lastLoginAt: "1761177600000",
  apiKey: "AIzaSyA-1234567890abcdefghijklmnopqrstu",
  appName: "[DEFAULT]",
}).padEnd(2500, " ");

function setup() {
  const memory = createMemorySecureKeyValue();
  const storage = createChunkedSecureStorage(memory.store, PREFIX);
  return { ...memory, storage };
}

const manifestKey = (key: string) => `${PREFIX}.${encodeKey(key)}.m`;

describe("encodeKey", () => {
  it("produces keys SecureStore accepts", () => {
    expect(encodeKey(FIREBASE_KEY)).toMatch(SECURE_KEY_PATTERN);
    expect(encodeKey("__sak")).toMatch(SECURE_KEY_PATTERN);
    expect(encodeKey("🍕 key")).toMatch(SECURE_KEY_PATTERN);
  });

  it("never gives two different keys the same name", () => {
    const keys = ["a:b", "a_003ab", "a.b", "a_b", "a b", "a-b", "ab", "AB"];
    expect(new Set(keys.map(encodeKey)).size).toBe(keys.length);
  });
});

describe("splitIntoChunks", () => {
  it("keeps chunks within the length and rejoins exactly", () => {
    const value = "x".repeat(1_301);
    const chunks = splitIntoChunks(value);
    expect(chunks.map((chunk) => chunk.length)).toEqual([600, 600, 101]);
    expect(chunks.join("")).toBe(value);
  });

  it("never splits an emoji between chunks", () => {
    // The leading "x" puts every pair across a 600-unit boundary.
    const value = `x${"🍕".repeat(1_000)}`;
    const chunks = splitIntoChunks(value);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(SESSION_CHUNK_LENGTH);
      expect(/[\uD800-\uDBFF]$/.test(chunk)).toBe(false);
    }
    expect(chunks.join("")).toBe(value);
  });

  it("returns no chunks for an empty value", () => {
    expect(splitIntoChunks("")).toEqual([]);
  });
});

describe("chunked secure storage", () => {
  it.each([
    ["a Firebase session", FIREBASE_VALUE],
    ["a small value", "1"],
    ["an empty value", ""],
    ["5 KB", "s".repeat(5_000)],
    ["accented text", "é".repeat(3_000)],
    ["CJK text", "漢".repeat(2_000)],
    ["emoji", `x${"🍕".repeat(1_000)}`],
  ])("round-trips %s", async (_label, value) => {
    const { storage } = setup();
    await storage.setItem(FIREBASE_KEY, value);
    expect(await storage.getItem(FIREBASE_KEY)).toBe(value);
  });

  it("stores only keys and values SecureStore accepts", async () => {
    const { storage, items } = setup();
    await storage.setItem(FIREBASE_KEY, FIREBASE_VALUE);
    expect(items.size).toBeGreaterThan(3); // manifest, index and several chunks
    for (const [key, value] of items) {
      expect(key).toMatch(SECURE_KEY_PATTERN);
      expect(utf8Length(value)).toBeLessThanOrEqual(SECURE_STORE_VALUE_LIMIT_BYTES);
    }
  });

  it("returns null for an item that was never stored", async () => {
    const { storage } = setup();
    expect(await storage.getItem(FIREBASE_KEY)).toBeNull();
  });

  it("overwrites with a shorter value and removes the old chunks", async () => {
    const { storage, items } = setup();
    await storage.setItem(FIREBASE_KEY, "a".repeat(5_000));
    await storage.setItem(FIREBASE_KEY, "short");
    expect(await storage.getItem(FIREBASE_KEY)).toBe("short");
    expect(items.size).toBe(3); // index, manifest, one chunk
  });

  it("keeps the previous value if a write fails part way", async () => {
    const { storage, failWritesAfter, stopFailing } = setup();
    await storage.setItem(FIREBASE_KEY, "old session");
    failWritesAfter(2); // two chunks of the new value, then the "crash"
    // The native error surfaces as a domain error.
    await expect(storage.setItem(FIREBASE_KEY, "n".repeat(3_000))).rejects.toMatchObject({
      name: "DomainError",
      code: "storage_failed",
    });
    stopFailing();
    expect(await storage.getItem(FIREBASE_KEY)).toBe("old session");

    // The next write still works and replaces it cleanly.
    await storage.setItem(FIREBASE_KEY, "new session");
    expect(await storage.getItem(FIREBASE_KEY)).toBe("new session");
  });

  it("reads nothing if the first write fails part way", async () => {
    const { storage, failWritesAfter } = setup();
    failWritesAfter(3);
    await expect(storage.setItem(FIREBASE_KEY, FIREBASE_VALUE)).rejects.toThrow();
    expect(await storage.getItem(FIREBASE_KEY)).toBeNull();
  });

  it("removes an item completely", async () => {
    const { storage, items } = setup();
    await storage.setItem(FIREBASE_KEY, FIREBASE_VALUE);
    await storage.removeItem(FIREBASE_KEY);
    expect(await storage.getItem(FIREBASE_KEY)).toBeNull();
    expect(items.size).toBe(0);
  });

  it("removing one item keeps the others", async () => {
    const { storage } = setup();
    await storage.setItem("one", "1");
    await storage.setItem("two", "2");
    await storage.removeItem("one");
    expect(await storage.getItem("one")).toBeNull();
    expect(await storage.getItem("two")).toBe("2");
  });

  it("clear removes every item, including leftovers from interrupted writes", async () => {
    const { storage, items, failWritesAfter, stopFailing } = setup();
    await storage.setItem(FIREBASE_KEY, FIREBASE_VALUE);
    await storage.setItem("__sak", "1");
    failWritesAfter(2);
    await expect(storage.setItem(FIREBASE_KEY, "z".repeat(5_000))).rejects.toThrow();
    stopFailing();

    await storage.clear();
    expect(items.size).toBe(0);
    expect(await storage.getItem(FIREBASE_KEY)).toBeNull();
  });

  it("handles concurrent writes without losing items", async () => {
    const { storage, items } = setup();
    await Promise.all([
      storage.setItem("one", "1"),
      storage.setItem("two", "2".repeat(2_000)),
      storage.setItem("three", "3"),
    ]);
    expect(await storage.getItem("two")).toBe("2".repeat(2_000));
    await storage.clear();
    expect(items.size).toBe(0);
  });

  it.each([
    ["not JSON", "not json"],
    ["an unknown slot", JSON.stringify({ slot: "c", count: 1, length: 3 })],
    ["the wrong length", JSON.stringify({ slot: "a", count: 1, length: 999 })],
    ["too many chunks", JSON.stringify({ slot: "a", count: 999, length: 3 })],
    ["a missing chunk", JSON.stringify({ slot: "a", count: 2, length: 3 })],
  ])("reads a manifest with %s as missing", async (_label, manifest) => {
    const { storage, items } = setup();
    await storage.setItem(FIREBASE_KEY, "abc");
    items.set(manifestKey(FIREBASE_KEY), manifest);
    expect(await storage.getItem(FIREBASE_KEY)).toBeNull();
  });

  it("reads a storage error as missing", async () => {
    const { storage, store } = setup();
    await storage.setItem(FIREBASE_KEY, "abc");
    jest.spyOn(store, "getItemAsync").mockRejectedValue(new Error("Keystore unavailable"));
    expect(await storage.getItem(FIREBASE_KEY)).toBeNull();
  });

  it("rejects a value that needs too many chunks and keeps the old one", async () => {
    const { storage } = setup();
    await storage.setItem(FIREBASE_KEY, "old");
    await expect(
      storage.setItem(FIREBASE_KEY, "x".repeat(MAX_SESSION_CHUNKS * SESSION_CHUNK_LENGTH + 1)),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(await storage.getItem(FIREBASE_KEY)).toBe("old");
  });

  it(`stores at most ${MAX_SESSION_ITEMS} items`, async () => {
    const { storage } = setup();
    for (let i = 0; i < MAX_SESSION_ITEMS; i += 1) {
      await storage.setItem(`item${i}`, "x");
    }
    await expect(storage.setItem("one-too-many", "x")).rejects.toMatchObject({ code: "storage_failed" });
  });

  it("rejects keys that would be too long", async () => {
    const { storage } = setup();
    await expect(storage.setItem("k".repeat(200), "x")).rejects.toMatchObject({ code: "invalid_input" });
    expect(await storage.getItem("k".repeat(200))).toBeNull();
  });

  it("reports native failures on remove and clear as storage_failed", async () => {
    const { storage, store } = setup();
    await storage.setItem(FIREBASE_KEY, "abc");
    jest.spyOn(store, "deleteItemAsync").mockRejectedValue(new Error("Keychain error -25300"));
    await expect(storage.removeItem(FIREBASE_KEY)).rejects.toMatchObject({ code: "storage_failed" });
    await expect(storage.clear()).rejects.toMatchObject({ code: "storage_failed" });
  });
});
