import { createContext, useContext, useState, type ReactNode } from "react";
import type { LocalDataWiper } from "./account/LocalDataWiper";
import type { AuthService } from "./auth/AuthService";
import type { ConnectivityService } from "./connectivity/ConnectivityService";
import type { RemoteProfileStore } from "./profiles/RemoteProfileStore";
import type { SecureSessionStore } from "./session/SecureSessionStore";
import type { SessionGuard } from "./session/sessionGuard";
import type { SessionPolicy } from "./session/SessionPolicy";
import type { SyncService } from "./sync/SyncService";
import type { RemoteUserContent } from "./userData/RemoteUserContent";
import type { UsernameRegistry } from "./usernames/UsernameRegistry";

// Account services. Screens use the hooks below and never import Firebase,
// expo-secure-store or expo-network directly.
export type Services = {
  auth: AuthService;
  usernames: UsernameRegistry;
  remoteProfiles: RemoteProfileStore;
  remoteContent: RemoteUserContent;
  sessionStore: SecureSessionStore;
  sessionPolicy: SessionPolicy;
  sessionGuard: SessionGuard;
  sync: SyncService;
  connectivity: ConnectivityService;
  localData: LocalDataWiper;
};

// Shares the services with every screen inside ServiceProvider.
const ServiceContext = createContext<Services | null>(null);

type ServiceProviderProps = {
  children: ReactNode;
  // Built by createAppServices (the composition root), or fakes in tests.
  services: Services;
};

// Makes the services available to every screen inside it. useState keeps the first
// set it was given, so the services never change while the app is running.
export function ServiceProvider({ children, services }: ServiceProviderProps) {
  const [value] = useState<Services>(() => services);
  return <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>;
}

// Fails loudly if a screen is used outside the provider (a setup mistake).
function useServices(): Services {
  const services = useContext(ServiceContext);
  if (!services) {
    throw new Error("Service hooks must be used inside ServiceProvider");
  }
  return services;
}

// One hook per service, so a screen asks only for what it uses.
export function useAuthService(): AuthService {
  return useServices().auth;
}

export function useUsernameRegistry(): UsernameRegistry {
  return useServices().usernames;
}

export function useRemoteProfileStore(): RemoteProfileStore {
  return useServices().remoteProfiles;
}

export function useRemoteUserContent(): RemoteUserContent {
  return useServices().remoteContent;
}

export function useSecureSessionStore(): SecureSessionStore {
  return useServices().sessionStore;
}

export function useSessionPolicy(): SessionPolicy {
  return useServices().sessionPolicy;
}

export function useSessionGuard(): SessionGuard {
  return useServices().sessionGuard;
}

export function useSyncService(): SyncService {
  return useServices().sync;
}

export function useConnectivity(): ConnectivityService {
  return useServices().connectivity;
}

export function useLocalDataWiper(): LocalDataWiper {
  return useServices().localData;
}
