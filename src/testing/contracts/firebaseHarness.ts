// Points the real Firebase services at the emulators, so the shared contract suite can
// run against them (npm run test:backend). Uses a demo- project, so nothing can reach a
// real database, and the services come from the same factories the app uses.
//
// supportsControls is false, because the emulators have no fake clock and can't be told
// to fail a chosen call. These contract tests are skipped here and run in memory only:
//   AuthService (4): offline; an injected failure; recent login after the clock moves;
//     only domain errors thrown.
//   UsernameRegistry (3): offline; half a claim after a failed commit; sign up failing half way.
//   RemoteProfileStore (1) and RemoteUserContent (1): offline.
// Offline is covered differently for Firebase in firebaseBackend.emulator.ts.
import { createFirebaseAuthService } from "@/services/auth/firebaseAuthService";
import type { ConnectivityService } from "@/services/connectivity/ConnectivityService";
import type { FirebaseClient } from "@/services/firebase/client";
import { createFirebaseRemoteProfileStore } from "@/services/profiles/firebaseRemoteProfileStore";
import { createFirebaseRemoteUserContent } from "@/services/userData/firebaseRemoteUserContent";
import { createFirebaseUsernameRegistry } from "@/services/usernames/firebaseUsernameRegistry";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore } from "firebase/firestore";
import { createFakeConnectivity } from "../fakes/fakeConnectivity";
import type { BackendHarness } from "./backendContract";

export const EMULATOR_PROJECT_ID = "demo-feast";

// emulators:exec sets these. The defaults are the ports in firebase.json.
function emulatorHost(variable: string, fallbackPort: number): { host: string; port: number } {
  const [host, port] = (process.env[variable] ?? `127.0.0.1:${fallbackPort}`).split(":");
  return { host, port: Number(port) };
}

type BackendOptions = {
  connectivity?: ConnectivityService;
  timeoutMs?: number;
};

export function createFirebaseHarness() {
  const apps: FirebaseApp[] = [];
  let counter = 0;

  // Every backend is its own named app, so two users can be signed in at the same time.
  function createClient(): FirebaseClient {
    counter += 1;
    const app = initializeApp({ projectId: EMULATOR_PROJECT_ID, apiKey: "demo-api-key" }, `emulator-test-${counter}`);
    apps.push(app);

    const authEmulator = emulatorHost("FIREBASE_AUTH_EMULATOR_HOST", 9099);
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${authEmulator.host}:${authEmulator.port}`, { disableWarnings: true });

    const firestoreEmulator = emulatorHost("FIRESTORE_EMULATOR_HOST", 8080);
    const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
    connectFirestoreEmulator(db, firestoreEmulator.host, firestoreEmulator.port);

    return { app, auth, db };
  }

  // One "phone": a client plus the four services, built the way the app builds them.
  function createBackend({ connectivity = createFakeConnectivity(true).service, timeoutMs }: BackendOptions = {}) {
    const client = createClient();
    const callOptions = { connectivity, timeoutMs };
    return {
      client,
      auth: createFirebaseAuthService({ client }),
      usernames: createFirebaseUsernameRegistry({ client, ...callOptions }),
      remoteProfiles: createFirebaseRemoteProfileStore({ client, ...callOptions }),
      remoteContent: createFirebaseRemoteUserContent({ client, ...callOptions }),
    };
  }

  const harness: BackendHarness = {
    supportsControls: false,
    create: async () => createBackend(),
    uniqueEmail: () => `user${Date.now().toString(36)}${++counter}@example.com`,
    uniqueUsername: () => `t_${Date.now().toString(36)}${++counter}`,
  };

  return {
    ...harness,
    createBackend,
    // Closes every app, so the test run can exit.
    dispose: () => Promise.all(apps.splice(0).map((app) => deleteApp(app))),
  };
}
