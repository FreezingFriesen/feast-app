import type { SecureKeyValueStore } from "@/services/session/secureKeyValue";
import { SECURE_KEY_PATTERN } from "@/validation/patterns";

// The value size some platforms reject (older iOS).
export const SECURE_STORE_VALUE_LIMIT_BYTES = 2048;

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function utf8Length(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

// In-memory stand-in for expo-secure-store with its limits: keys must use the allowed
// characters, and values over 2048 bytes or containing half an emoji are rejected.
export function createMemorySecureKeyValue() {
  const items = new Map<string, string>();
  let writesBeforeFailure: number | null = null;

  const store: SecureKeyValueStore = {
    async getItemAsync(key) {
      if (!SECURE_KEY_PATTERN.test(key)) throw new Error("Invalid key");
      return items.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      if (!SECURE_KEY_PATTERN.test(key)) throw new Error("Invalid key");
      if (utf8Length(value) > SECURE_STORE_VALUE_LIMIT_BYTES) throw new Error("Value too large");
      if (LONE_SURROGATE.test(value)) throw new Error("Value has a split surrogate pair");
      if (writesBeforeFailure !== null) {
        if (writesBeforeFailure === 0) throw new Error("Simulated write failure");
        writesBeforeFailure -= 1;
      }
      items.set(key, value);
    },
    async deleteItemAsync(key) {
      if (!SECURE_KEY_PATTERN.test(key)) throw new Error("Invalid key");
      items.delete(key);
    },
  };

  return {
    store,
    items,
    // The next `count` writes succeed, then every write throws (simulates a crash or full keychain).
    failWritesAfter(count: number) {
      writesBeforeFailure = count;
    },
    stopFailing() {
      writesBeforeFailure = null;
    },
  };
}
