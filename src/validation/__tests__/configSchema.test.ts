import { backendSchema, firebaseConfigSchema } from "../configSchema";

// Made-up values in the shape of a Firebase web config.
const valid = {
  apiKey: "test-api-key_0123456789",
  authDomain: "feast-demo.firebaseapp.com",
  projectId: "feast-demo",
  storageBucket: "feast-demo.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef0123456789",
};

const accepts = (input: unknown) => firebaseConfigSchema.safeParse(input).success;

describe("firebaseConfigSchema", () => {
  it("accepts a valid config and drops unknown fields", () => {
    expect(firebaseConfigSchema.parse({ ...valid, measurementId: "G-123" })).toEqual(valid);
  });

  it.each(Object.keys(valid))("rejects a missing %s (unset variable)", (key) => {
    expect(accepts({ ...valid, [key]: undefined })).toBe(false);
  });

  it.each([
    ["", false],
    ["a".repeat(200), true],
    ["a".repeat(201), false],
    ["feast demo", false],
    ["https://feast-demo.firebaseapp.com", false],
    ["'; DROP TABLE recipes;--", false],
    ["<script>alert(1)</script>", false],
    ["feast-demo​", false],
    ["🍕", false],
  ])("projectId %p -> %p", (projectId, ok) => {
    expect(accepts({ ...valid, projectId })).toBe(ok);
  });

  it("rejects wrong types", () => {
    expect(accepts({ ...valid, messagingSenderId: 123456789012 })).toBe(false);
    expect(accepts(null)).toBe(false);
  });
});

describe("backendSchema", () => {
  it.each([
    ["memory", true],
    ["firebase", true],
    ["Firebase", false],
    ["sqlite", false],
    ["", false],
  ])("%p -> %p", (backend, ok) => {
    expect(backendSchema.safeParse(backend).success).toBe(ok);
  });
});
