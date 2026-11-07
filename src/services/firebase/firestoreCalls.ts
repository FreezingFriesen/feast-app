// Every Firestore call goes through here, because of how the SDK behaves with no
// connection (checked on the emulator with the network turned off):
//   - writes are queued and their promise stays pending, so they would hang forever
//   - a list read answers from the cache, so "nothing there" could really mean "offline"
// So the services read from the server only (getDocFromServer, getDocsFromServer), and
// each call checks the connection first and gives up after a time limit. The time limit
// is needed because the phone can say it's online when it isn't (captive portals, iOS).
//
// A write that timed out stays queued and can still land later. Every write is safe to
// repeat, and a late username claim is picked up by the next profile refresh.
import type { ConnectivityService } from "@/services/connectivity/ConnectivityService";
import { domainError } from "@/services/domainErrors";

export const FIRESTORE_CALL_TIMEOUT_MS = 15_000;

// What each Firestore service needs for this, passed in so tests can control it.
export type FirestoreCallOptions = {
  connectivity: ConnectivityService;
  timeoutMs?: number;
};

// Runs one Firestore call. Rejects with an offline DomainError if the device is offline
// or the call takes too long; any other failure is passed on for the caller to map.
export async function firestoreCall<T>(
  { connectivity, timeoutMs = FIRESTORE_CALL_TIMEOUT_MS }: FirestoreCallOptions,
  call: () => Promise<T>,
): Promise<T> {
  if (!(await connectivity.isOnline())) {
    throw domainError("offline");
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeLimit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(domainError("offline")), timeoutMs);
  });
  try {
    return await Promise.race([call(), timeLimit]);
  } finally {
    clearTimeout(timer);
  }
}
