import { isDomainError } from "@/services/domainErrors";
import { createChunkedSecureStorage } from "@/services/session/chunkedSecureStorage";
import { createMemorySecureKeyValue } from "@/testing/fakes/memorySecureKeyValue";
import { createFirebaseClient, firebaseConfigFromEnv } from "../client";

jest.mock("firebase/app", () => ({
  getApps: jest.fn(),
  getApp: jest.fn(),
  initializeApp: jest.fn(),
}));
jest.mock("firebase/auth", () => ({
  getAuth: jest.fn(),
  getReactNativePersistence: jest.fn(),
  initializeAuth: jest.fn(),
}));
jest.mock("firebase/firestore", () => ({ getFirestore: jest.fn() }));

type Mocked = Record<string, jest.Mock>;
const appSdk = jest.requireMock<Mocked>("firebase/app");
const authSdk = jest.requireMock<Mocked>("firebase/auth");
const firestoreSdk = jest.requireMock<Mocked>("firebase/firestore");

const config = {
  apiKey: "test-api-key_0123456789",
  authDomain: "feast-demo.firebaseapp.com",
  projectId: "feast-demo",
  storageBucket: "feast-demo.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef0123456789",
};

const app = { name: "app" };
const auth = { name: "auth" };
const db = { name: "db" };
const persistence = { name: "persistence" };

beforeEach(() => {
  jest.clearAllMocks();
  appSdk.getApps.mockReturnValue([]);
  appSdk.initializeApp.mockReturnValue(app);
  authSdk.getReactNativePersistence.mockReturnValue(persistence);
  authSdk.initializeAuth.mockReturnValue(auth);
  firestoreSdk.getFirestore.mockReturnValue(db);
});

const authStorage = () => createChunkedSecureStorage(createMemorySecureKeyValue().store, "feast.session.auth");

describe("createFirebaseClient", () => {
  it("keeps the auth session in the storage it is given (secure storage, never AsyncStorage)", () => {
    const storage = authStorage();
    expect(createFirebaseClient({ authStorage: storage, config })).toEqual({ app, auth, db });
    expect(appSdk.initializeApp).toHaveBeenCalledWith(config);
    expect(authSdk.getReactNativePersistence).toHaveBeenCalledTimes(1);
    expect(authSdk.getReactNativePersistence.mock.calls[0][0]).toBe(storage);
    expect(authSdk.initializeAuth).toHaveBeenCalledWith(app, { persistence });
  });

  it("reuses the app and auth after a fast refresh", () => {
    const existingAuth = { name: "existing auth" };
    appSdk.getApps.mockReturnValue([app]);
    appSdk.getApp.mockReturnValue(app);
    authSdk.initializeAuth.mockImplementation(() => {
      throw new Error("already initialized");
    });
    authSdk.getAuth.mockReturnValue(existingAuth);

    expect(createFirebaseClient({ authStorage: authStorage(), config }).auth).toBe(existingAuth);
    expect(appSdk.initializeApp).not.toHaveBeenCalled();
    expect(authSdk.getAuth).toHaveBeenCalledWith(app);
  });
});

describe("firebaseConfigFromEnv", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("fails with backend_not_configured when a variable is missing", () => {
    delete process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
    let thrown: unknown;
    try {
      firebaseConfigFromEnv();
    } catch (error) {
      thrown = error;
    }
    expect(isDomainError(thrown)).toBe(true);
    expect(thrown).toMatchObject({ code: "backend_not_configured" });
  });

  it("does not create a client without a valid config", () => {
    delete process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
    expect(() => createFirebaseClient({ authStorage: authStorage() })).toThrow("backend_not_configured");
    expect(appSdk.initializeApp).not.toHaveBeenCalled();
  });
});
