// Whether the device can reach the internet. Sign up, log in, password reset, change
// password and delete account need a connection; everything else works offline.
// A "true" here can still be wrong (captive portals, iOS), so network errors from the
// server are also treated as offline.
export type ConnectivityService = {
  isOnline(): Promise<boolean>;
  // Calls the listener whenever connectivity changes. Returns an unsubscribe function.
  subscribe(listener: (online: boolean) => void): () => void;
};
