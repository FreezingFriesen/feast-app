import type { NetworkState } from "expo-network";
import { createExpoNetworkConnectivity, isOnlineState } from "../expoNetworkConnectivity";

type NetworkModule = NonNullable<Parameters<typeof createExpoNetworkConnectivity>[0]>;

function fakeNetwork(state: NetworkState | Error) {
  let listener: ((state: NetworkState) => void) | undefined;
  const remove = jest.fn();
  const network = {
    getNetworkStateAsync: async () => {
      if (state instanceof Error) throw state;
      return state;
    },
    addNetworkStateListener: (callback: (state: NetworkState) => void) => {
      listener = callback;
      return { remove };
    },
  } as unknown as NetworkModule;
  return { network, remove, emit: (next: NetworkState) => listener?.(next) };
}

describe("isOnlineState", () => {
  it.each([
    [{ isConnected: true, isInternetReachable: true }, true],
    [{ isConnected: true }, true], // reachability not known yet
    [{ isConnected: true, isInternetReachable: false }, false], // e.g. Wi-Fi without internet
    [{ isConnected: false, isInternetReachable: true }, false],
    [{ isConnected: false }, false], // airplane mode
    [{}, false],
  ])("%p -> %p", (state, online) => {
    expect(isOnlineState(state)).toBe(online);
  });
});

describe("expo-network connectivity", () => {
  it("reports the current state", async () => {
    const online = createExpoNetworkConnectivity(fakeNetwork({ isConnected: true, isInternetReachable: true }).network);
    const offline = createExpoNetworkConnectivity(fakeNetwork({ isConnected: false }).network);
    expect(await online.isOnline()).toBe(true);
    expect(await offline.isOnline()).toBe(false);
  });

  it("treats an error reading the state as offline", async () => {
    const connectivity = createExpoNetworkConnectivity(fakeNetwork(new Error("unavailable")).network);
    expect(await connectivity.isOnline()).toBe(false);
  });

  it("passes changes to the listener until unsubscribed", () => {
    const { network, emit, remove } = fakeNetwork({ isConnected: true });
    const listener = jest.fn();
    const unsubscribe = createExpoNetworkConnectivity(network).subscribe(listener);

    emit({ isConnected: false });
    emit({ isConnected: true, isInternetReachable: true });
    expect(listener.mock.calls).toEqual([[false], [true]]);

    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
