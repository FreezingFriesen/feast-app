// The server-side services when EXPO_PUBLIC_BACKEND is "firebase". createAppServices
// loads this file only for that backend, so with "memory" the Firebase SDK never runs
// and nothing reads the Firebase variables.
import { createFirebaseAuthService } from "@/services/auth/firebaseAuthService";
import type { ConnectivityService } from "@/services/connectivity/ConnectivityService";
import { createFirebaseRemoteProfileStore } from "@/services/profiles/firebaseRemoteProfileStore";
import type { ChunkedSecureStorage } from "@/services/session/chunkedSecureStorage";
import { createFirebaseRemoteContentStore } from "@/services/userData/firebaseRemoteContentStore";
import { createFirebaseRemoteUserContent } from "@/services/userData/firebaseRemoteUserContent";
import { createFirebaseUsernameRegistry } from "@/services/usernames/firebaseUsernameRegistry";
import { createFirebaseClient, firebaseConfigFromEnv } from "./client";

type FirebaseRemoteDependencies = {
  // sessionStore.authStorage: Firebase's session goes to secure storage.
  authStorage: ChunkedSecureStorage;
  connectivity: ConnectivityService;
  now: () => number;
};

export function createFirebaseRemote({ authStorage, connectivity, now }: FirebaseRemoteDependencies) {
  const client = createFirebaseClient({ authStorage, config: firebaseConfigFromEnv() });
  return {
    auth: createFirebaseAuthService({ client }),
    usernames: createFirebaseUsernameRegistry({ client, connectivity, now }),
    remoteProfiles: createFirebaseRemoteProfileStore({ client, connectivity }),
    remoteContent: createFirebaseRemoteUserContent({ client, connectivity }),
    // The same shared client, so sync writes as the signed-in user.
    remoteStore: createFirebaseRemoteContentStore({ client, connectivity }),
  };
}
