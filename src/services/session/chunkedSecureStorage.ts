import { domainError, withDomainErrors } from "@/services/domainErrors";
import type { z } from "zod";
import {
  chunkManifestSchema,
  MAX_SESSION_CHUNKS,
  MAX_SESSION_ITEM_NAME_LENGTH,
  MAX_SESSION_ITEMS,
  SESSION_CHUNK_LENGTH,
  sessionItemIndexSchema,
} from "@/validation/authSchema";
import type { SecureKeyValueStore } from "./secureKeyValue";

// Same shape as Firebase Auth's ReactNativeAsyncStorage, plus clear().
export type ChunkedSecureStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
};

type Manifest = z.output<typeof chunkManifestSchema>;
type Slot = Manifest["slot"];
const SLOTS: readonly Slot[] = ["a", "b"];

// SecureStore keys allow only [A-Za-z0-9._-]. Every other character, and "." and "_"
// themselves, becomes "_" plus 4 hex digits. Different keys always get different
// names, and "." stays free to separate the parts of a stored key.
export function encodeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9-]/g, (char) => `_${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

// Chunks of at most `length` UTF-16 units, never split between the two halves of a
// surrogate pair (emoji), which would not survive the native string conversion.
export function splitIntoChunks(value: string, length: number = SESSION_CHUNK_LENGTH): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(start + length, value.length);
    if (end < value.length && end - start > 1 && isHighSurrogate(value.charCodeAt(end - 1))) {
      end -= 1;
    }
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks;
}

// Key/value storage on top of expo-secure-store, which rejects keys containing ":"
// and may reject values over about 2 KB (Firebase Auth's session has both).
// Layout for an item named N under prefix P:
//   P.index          JSON list of item names, so clear() can find them all
//   P.N.m            manifest: the slot holding the chunks, chunk count, total length
//   P.N.a0, P.N.a1   chunks in slot "a" (or b0, b1 in slot "b")
// A write fills the slot that isn't in use, then switches the manifest to it in a single
// write, so a crash part way through leaves the previous value complete and readable.
export function createChunkedSecureStorage(secure: SecureKeyValueStore, prefix: string): ChunkedSecureStorage {
  const indexKey = `${prefix}.index`;
  const manifestKey = (name: string) => `${prefix}.${name}.m`;
  const chunkKey = (name: string, slot: Slot, position: number) => `${prefix}.${name}.${slot}${position}`;

  // Data read back from storage is untrusted: anything unreadable counts as missing.
  async function readJson<S extends z.ZodType>(key: string, schema: S): Promise<z.output<S> | null> {
    const raw = await secure.getItemAsync(key);
    if (raw === null) return null;
    try {
      const result = schema.safeParse(JSON.parse(raw));
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  const readManifest = (name: string) => readJson(manifestKey(name), chunkManifestSchema);
  const readIndex = async () => (await readJson(indexKey, sessionItemIndexSchema)) ?? [];

  async function deleteChunks(name: string, slot: Slot, count: number) {
    for (let position = 0; position < count; position += 1) {
      await secure.deleteItemAsync(chunkKey(name, slot, position));
    }
  }

  async function addToIndex(name: string) {
    const names = await readIndex();
    if (names.includes(name)) return;
    if (names.length >= MAX_SESSION_ITEMS) {
      throw domainError("storage_failed");
    }
    await secure.setItemAsync(indexKey, JSON.stringify([...names, name]));
  }

  async function removeFromIndex(name: string) {
    const names = (await readIndex()).filter((existing) => existing !== name);
    if (names.length === 0) {
      await secure.deleteItemAsync(indexKey);
    } else {
      await secure.setItemAsync(indexKey, JSON.stringify(names));
    }
  }

  async function getItem(key: string): Promise<string | null> {
    const name = encodeKey(key);
    if (name.length > MAX_SESSION_ITEM_NAME_LENGTH) return null;
    const manifest = await readManifest(name);
    if (!manifest) return null;

    let value = "";
    for (let position = 0; position < manifest.count; position += 1) {
      const chunk = await secure.getItemAsync(chunkKey(name, manifest.slot, position));
      if (chunk === null) return null;
      value += chunk;
    }
    // A missing or damaged chunk means the session can't be trusted: read it as signed out.
    return value.length === manifest.length ? value : null;
  }

  async function setItem(key: string, value: string): Promise<void> {
    const name = encodeKey(key);
    const chunks = splitIntoChunks(value);
    if (name.length > MAX_SESSION_ITEM_NAME_LENGTH || chunks.length > MAX_SESSION_CHUNKS) {
      throw domainError("invalid_input");
    }

    // Record the name first, so clear() can always find what was written.
    await addToIndex(name);
    const current = await readManifest(name);
    const slot: Slot = current?.slot === "a" ? "b" : "a";
    for (let position = 0; position < chunks.length; position += 1) {
      await secure.setItemAsync(chunkKey(name, slot, position), chunks[position]);
    }
    const manifest: Manifest = { slot, count: chunks.length, length: value.length };
    await secure.setItemAsync(manifestKey(name), JSON.stringify(manifest));

    // The old copy is no longer referenced. Anything a failed delete leaves behind is
    // overwritten by the next write or removed by clear().
    if (current) {
      await deleteChunks(name, current.slot, current.count).catch(() => {});
    }
  }

  async function removeItem(key: string): Promise<void> {
    const name = encodeKey(key);
    if (name.length > MAX_SESSION_ITEM_NAME_LENGTH) return;
    const current = await readManifest(name);
    // Delete the manifest first: from then on the item reads as missing.
    await secure.deleteItemAsync(manifestKey(name));
    if (current) {
      await deleteChunks(name, current.slot, current.count);
    }
    await removeFromIndex(name);
  }

  async function clear(): Promise<void> {
    for (const name of await readIndex()) {
      await secure.deleteItemAsync(manifestKey(name));
      // Every position in both slots, which also removes leftovers from interrupted writes.
      for (const slot of SLOTS) {
        await deleteChunks(name, slot, MAX_SESSION_CHUNKS);
      }
    }
    await secure.deleteItemAsync(indexKey);
  }

  // One operation at a time, so concurrent calls from the auth SDK can't interleave
  // index updates or read a value while it is being replaced.
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }

  // Native SecureStore failures surface as storage_failed.
  const guarded = <T>(operation: () => Promise<T>) => serial(() => withDomainErrors(operation, "storage_failed"));

  return {
    // A storage error while reading also counts as missing (signed out).
    getItem: (key) => serial(() => getItem(key).catch(() => null)),
    setItem: (key, value) => guarded(() => setItem(key, value)),
    removeItem: (key) => guarded(() => removeItem(key)),
    clear: () => guarded(clear),
  };
}
