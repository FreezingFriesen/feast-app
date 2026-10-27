import { useProfileRepository } from "@/repositories/RepositoryProvider";
import { createAccountDeleter } from "@/services/account/AccountDeleter";
import { createLogOutFlow } from "@/services/account/logOutFlow";
import { createSecurityFlow } from "@/services/account/securityFlow";
import { createSignInFlow } from "@/services/account/signInFlow";
import { createSignUpFlow } from "@/services/account/signUpFlow";
import {
  useAuthService,
  useLocalDataWiper,
  useRemoteProfileStore,
  useRemoteUserContent,
  useSessionGuard,
  useSyncService,
  useUsernameRegistry,
} from "@/services/ServiceProvider";
import { useMemo } from "react";

// The account use cases, built from the services the app was started with.
export function useAccountFlows() {
  const auth = useAuthService();
  const usernames = useUsernameRegistry();
  const remoteProfiles = useRemoteProfileStore();
  const remoteContent = useRemoteUserContent();
  const sessionGuard = useSessionGuard();
  const localData = useLocalDataWiper();
  const profiles = useProfileRepository();
  const sync = useSyncService();

  return useMemo(
    () => ({
      signUp: createSignUpFlow({ auth, usernames, profiles, sessionGuard }),
      signIn: createSignInFlow({ auth, profiles, remoteProfiles, sessionGuard }),
      logOut: createLogOutFlow({ auth, sessionGuard, localData, sync }),
      security: createSecurityFlow({ auth }),
      deleteAccount: createAccountDeleter({
        auth,
        usernames,
        remoteProfiles,
        remoteContent,
        profiles,
        sessionGuard,
        localData,
      }),
    }),
    [auth, usernames, remoteProfiles, remoteContent, sessionGuard, localData, profiles, sync],
  );
}
