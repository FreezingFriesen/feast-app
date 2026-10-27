// The expo-secure-store calls we use. The real adapter is expoSecureKeyValue.ts;
// tests pass an in-memory fake instead.
export type SecureKeyValueStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};
