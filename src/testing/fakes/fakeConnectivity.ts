import type { ConnectivityService } from "@/services/connectivity/ConnectivityService";

// Connectivity the test controls, e.g. to simulate airplane mode.
export function createFakeConnectivity(initiallyOnline = true) {
  let online = initiallyOnline;
  const listeners = new Set<(online: boolean) => void>();

  const service: ConnectivityService = {
    isOnline: async () => online,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return {
    service,
    setOnline(value: boolean) {
      online = value;
      listeners.forEach((listener) => listener(online));
    },
  };
}
