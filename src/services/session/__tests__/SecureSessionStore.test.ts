import { createMemorySecureKeyValue } from "@/testing/fakes/memorySecureKeyValue";
import { createSecureSessionStore } from "../SecureSessionStore";

const LOGIN = Date.UTC(2026, 9, 1, 12, 0);
const LOGIN_AT_KEY = "feast.session.loginAt";

function setup() {
  const memory = createMemorySecureKeyValue();
  return { ...memory, sessionStore: createSecureSessionStore(memory.store) };
}

describe("SecureSessionStore", () => {
  it("stores and reads the login date", async () => {
    const { sessionStore } = setup();
    expect(await sessionStore.getLoginAt()).toBeNull();
    await sessionStore.setLoginAt(LOGIN);
    expect(await sessionStore.getLoginAt()).toBe(LOGIN);
  });

  it.each(["", "abc", "-5", "1.5", "1e12", "99999999999999999999", "0", "<script>alert(1)</script>"])(
    "reads a stored login date of %p as missing",
    async (raw) => {
      const { sessionStore, items } = setup();
      items.set(LOGIN_AT_KEY, raw);
      expect(await sessionStore.getLoginAt()).toBeNull();
    },
  );

  it("reads a storage error as missing", async () => {
    const { sessionStore, store } = setup();
    jest.spyOn(store, "getItemAsync").mockRejectedValue(new Error("Keystore unavailable"));
    expect(await sessionStore.getLoginAt()).toBeNull();
  });

  it.each([NaN, Infinity, 1.5, -1, 0, Date.UTC(2101, 0, 1)])(
    "refuses to store login date %p",
    async (value) => {
      const { sessionStore, items } = setup();
      await expect(sessionStore.setLoginAt(value)).rejects.toMatchObject({ code: "invalid_input" });
      expect(items.size).toBe(0);
    },
  );

  it("keeps the auth SDK's session in secure storage", async () => {
    const { sessionStore, items } = setup();
    await sessionStore.authStorage.setItem("firebase:authUser:key:[DEFAULT]", "{\"token\":\"t\"}");
    expect(await sessionStore.authStorage.getItem("firebase:authUser:key:[DEFAULT]")).toBe("{\"token\":\"t\"}");
    expect([...items.keys()].every((key) => key.startsWith("feast.session."))).toBe(true);
  });

  it("clear removes the login date and the auth session", async () => {
    const { sessionStore, items } = setup();
    await sessionStore.setLoginAt(LOGIN);
    await sessionStore.authStorage.setItem("firebase:authUser:key:[DEFAULT]", "x".repeat(3_000));
    await sessionStore.clear();
    expect(items.size).toBe(0);
  });

  it("removes the login date first, so a failed token delete still ends the session", async () => {
    const { sessionStore, store } = setup();
    await sessionStore.setLoginAt(LOGIN);
    await sessionStore.authStorage.setItem("firebase:authUser:key:[DEFAULT]", "token");
    const realDelete = store.deleteItemAsync;
    jest.spyOn(store, "deleteItemAsync").mockImplementation(async (key) => {
      if (key.startsWith("feast.session.auth")) throw new Error("Keychain error");
      return realDelete(key);
    });

    await expect(sessionStore.clear()).rejects.toMatchObject({ code: "storage_failed" });
    expect(await sessionStore.getLoginAt()).toBeNull();
  });
});
