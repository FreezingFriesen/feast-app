import { createInMemoryProfileRepository } from "@/repositories/inMemoryProfileRepository";
import { createAccountDeleter } from "@/services/account/AccountDeleter";
import { createLocalDataWiper } from "@/services/account/LocalDataWiper";
import { createLogOutFlow } from "@/services/account/logOutFlow";
import { createSecurityFlow } from "@/services/account/securityFlow";
import { createSignInFlow } from "@/services/account/signInFlow";
import { createSignUpFlow } from "@/services/account/signUpFlow";
import { createInMemoryAuthService } from "@/services/auth/inMemoryAuthService";
import { createInMemoryServer, type InMemoryServer } from "@/services/backend/inMemoryServer";
import { createInMemoryRemoteProfileStore } from "@/services/profiles/inMemoryRemoteProfileStore";
import { createSecureSessionStore } from "@/services/session/SecureSessionStore";
import { createSessionGuard } from "@/services/session/sessionGuard";
import { createSessionPolicy } from "@/services/session/SessionPolicy";
import { createInMemoryRemoteUserContent } from "@/services/userData/inMemoryRemoteUserContent";
import { createInMemoryUsernameRegistry } from "@/services/usernames/inMemoryUsernameRegistry";
import { createFakeConnectivity } from "./fakes/fakeConnectivity";
import { createFakeSyncService } from "./fakes/fakeSyncService";
import { createMemorySecureKeyValue } from "./fakes/memorySecureKeyValue";

// One simulated backend that several "phones" can talk to.
export function createTestServer() {
  const connectivity = createFakeConnectivity(true);
  return { connectivity, server: createInMemoryServer({ connectivity: connectivity.service }) };
}

// One phone: its own local data and secure storage, with the account flows wired the
// same way createAppServices wires them.
export function createTestDevice(server: InMemoryServer, { wipeOnLogout }: { wipeOnLogout?: boolean } = {}) {
  const secure = createMemorySecureKeyValue();
  const profiles = createInMemoryProfileRepository();
  const auth = createInMemoryAuthService(server);
  const usernames = createInMemoryUsernameRegistry(server);
  const remoteProfiles = createInMemoryRemoteProfileStore(server);
  const remoteContent = createInMemoryRemoteUserContent(server);
  const sessionStore = createSecureSessionStore(secure.store);
  const localData = createLocalDataWiper([profiles]);
  const sessionGuard = createSessionGuard({ auth, store: sessionStore, policy: createSessionPolicy(), wiper: localData });
  const sync = createFakeSyncService();

  return {
    sync,
    auth,
    usernames,
    remoteProfiles,
    remoteContent,
    profiles,
    sessionStore,
    sessionGuard,
    localData,
    secure,
    signUpFlow: createSignUpFlow({ auth, usernames, profiles, sessionGuard }),
    signInFlow: createSignInFlow({ auth, profiles, remoteProfiles, sessionGuard }),
    logOutFlow: createLogOutFlow({ auth, sessionGuard, localData, sync: sync.service, wipeOnLogout }),
    securityFlow: createSecurityFlow({ auth }),
    accountDeleter: createAccountDeleter({
      auth,
      usernames,
      remoteProfiles,
      remoteContent,
      profiles,
      sessionGuard,
      localData,
    }),
  };
}
