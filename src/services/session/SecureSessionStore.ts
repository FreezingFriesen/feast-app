import { domainError, withDomainErrors } from "@/services/domainErrors";
import { storedLoginAtSchema, timestampSchema } from "@/validation/authSchema";
import { createChunkedSecureStorage, type ChunkedSecureStorage } from "./chunkedSecureStorage";
import type { SecureKeyValueStore } from "./secureKeyValue";

// Everything about the session that must stay in secure storage (never AsyncStorage).
export type SecureSessionStore = {
  // The login date (N-15), or null if it is missing or unreadable.
  getLoginAt(): Promise<number | null>;
  setLoginAt(timestamp: number): Promise<void>;
  // Storage for the auth SDK's own session (tokens). The Firebase implementation
  // passes this to getReactNativePersistence.
  authStorage: ChunkedSecureStorage;
  // Removes the auth SDK's session and the login date.
  clear(): Promise<void>;
};

const LOGIN_AT_KEY = "feast.session.loginAt";
const AUTH_STORAGE_PREFIX = "feast.session.auth";

export function createSecureSessionStore(secure: SecureKeyValueStore): SecureSessionStore {
  const authStorage = createChunkedSecureStorage(secure, AUTH_STORAGE_PREFIX);

  return {
    async getLoginAt() {
      try {
        const raw = await secure.getItemAsync(LOGIN_AT_KEY);
        if (raw === null) return null;
        // Data read back from storage is untrusted: anything invalid counts as missing.
        const result = storedLoginAtSchema.safeParse(raw);
        return result.success ? result.data : null;
      } catch {
        return null;
      }
    },

    async setLoginAt(timestamp) {
      const result = timestampSchema.safeParse(timestamp);
      if (!result.success) {
        throw domainError("invalid_input");
      }
      await withDomainErrors(() => secure.setItemAsync(LOGIN_AT_KEY, String(result.data)), "storage_failed");
    },

    authStorage,

    clear: () =>
      withDomainErrors(async () => {
        // Login date first: if clearing the tokens then fails, the missing login date
        // still ends the session at the next check.
        await secure.deleteItemAsync(LOGIN_AT_KEY);
        await authStorage.clear();
      }, "storage_failed"),
  };
}
