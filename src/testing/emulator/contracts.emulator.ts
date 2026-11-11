// The same contract suites the in-memory backend passes, against the real services on
// the Firebase emulators. The skipped tests are listed in firebaseHarness.ts.
import { createFirebaseRemoteContentStore } from "@/services/userData/firebaseRemoteContentStore";
import {
  describeAuthServiceContract,
  describeRemoteProfileStoreContract,
  describeRemoteUserContentContract,
  describeUsernameRegistryContract,
} from "../contracts/backendContract";
import { createFirebaseHarness } from "../contracts/firebaseHarness";
import { describeRemoteContentStoreContract } from "../contracts/remoteContentStoreContract";
import { createFakeConnectivity } from "../fakes/fakeConnectivity";

const harness = createFirebaseHarness();

afterAll(() => harness.dispose());

describeAuthServiceContract("Firebase emulators", harness);
describeUsernameRegistryContract("Firebase emulators", harness);
describeRemoteProfileStoreContract("Firebase emulators", harness);
describeRemoteUserContentContract("Firebase emulators", harness);

// Sync's remote store, against the real Security Rules.
describeRemoteContentStoreContract("Firebase emulators", {
  async signedInUser() {
    const backend = harness.createBackend();
    const result = await backend.auth.signUp({ email: harness.uniqueEmail(), password: "correct horse battery" });
    if (!result.ok) throw new Error(`Sign up failed: ${result.error}`);
    const store = createFirebaseRemoteContentStore({
      client: backend.client,
      connectivity: createFakeConnectivity(true).service,
    });
    return { uid: result.user.uid, store };
  },
});
