import * as Network from "expo-network";
import type { ConnectivityService } from "./ConnectivityService";

type NetworkModule = Pick<typeof Network, "getNetworkStateAsync" | "addNetworkStateListener">;

// isInternetReachable can be undefined while it is still unknown; only an explicit
// false counts as offline. On iOS it always matches isConnected.
export function isOnlineState(state: Network.NetworkState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

// expo-network is bundled in Expo Go. The module is passed in so tests can fake it.
export function createExpoNetworkConnectivity(network: NetworkModule = Network): ConnectivityService {
  return {
    async isOnline() {
      try {
        return isOnlineState(await network.getNetworkStateAsync());
      } catch {
        return false;
      }
    },

    subscribe(listener) {
      const subscription = network.addNetworkStateListener((state) => listener(isOnlineState(state)));
      return () => subscription.remove();
    },
  };
}
