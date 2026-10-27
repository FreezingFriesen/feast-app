import * as SecureStore from "expo-secure-store";
import type { SecureKeyValueStore } from "./secureKeyValue";

// THIS_DEVICE_ONLY: never copied to another device through backups, so a session
// can't follow the user to a new phone (#19 restores by logging in instead).
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// expo-secure-store is bundled in Expo Go. Not available on web.
export const expoSecureKeyValue: SecureKeyValueStore = {
  getItemAsync: (key) => SecureStore.getItemAsync(key, options),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, options),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, options),
};
