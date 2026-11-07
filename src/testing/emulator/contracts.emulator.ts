// The same contract suites the in-memory backend passes, against the real services on
// the Firebase emulators. The skipped tests are listed in firebaseHarness.ts.
import {
  describeAuthServiceContract,
  describeRemoteProfileStoreContract,
  describeRemoteUserContentContract,
  describeUsernameRegistryContract,
} from "../contracts/backendContract";
import { createFirebaseHarness } from "../contracts/firebaseHarness";

const harness = createFirebaseHarness();

afterAll(() => harness.dispose());

describeAuthServiceContract("Firebase emulators", harness);
describeUsernameRegistryContract("Firebase emulators", harness);
describeRemoteProfileStoreContract("Firebase emulators", harness);
describeRemoteUserContentContract("Firebase emulators", harness);
