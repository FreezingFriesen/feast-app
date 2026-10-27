// Shared behaviour every AuthService and UsernameRegistry implementation must have.
// Run against the in-memory backend now; point a Firebase emulator harness at it in Phase 6.
import type { AuthService, AuthUser, AuthUserResult } from "@/services/auth/AuthService";
import type { InMemoryOperation } from "@/services/backend/inMemoryServer";
import { isDomainError, type DomainErrorCode } from "@/services/domainErrors";
import type { RemoteProfileStore } from "@/services/profiles/RemoteProfileStore";
import type { RemoteUserContent } from "@/services/userData/RemoteUserContent";
import type { UsernameRegistry } from "@/services/usernames/UsernameRegistry";
import { UID_PATTERN } from "@/validation/patterns";
import { storedProfileSchema } from "@/validation/profileSchema";

export type BackendTestControls = {
  setOffline(offline: boolean): void;
  failNext(operation: InMemoryOperation, code?: DomainErrorCode): void;
  advanceClock(ms: number): void;
};

export type BackendHarness = {
  // The in-memory backend has controls. A Firebase emulator harness won't, and the
  // tests that need them are skipped.
  supportsControls: boolean;
  create(): Promise<{
    auth: AuthService;
    usernames: UsernameRegistry;
    remoteProfiles: RemoteProfileStore;
    remoteContent: RemoteUserContent;
    controls?: BackendTestControls;
  }>;
  // Unique per call, so the suite can run against a shared emulator.
  uniqueEmail(): string;
  uniqueUsername(): string;
};

const PASSWORD = "correct horse battery";
const NEW_PASSWORD = "staple battery horse";
const MINUTE = 60 * 1000;

function expectUser(result: AuthUserResult): AuthUser {
  if (!result.ok) throw new Error(`Expected a user, got ${result.error}`);
  return result.user;
}

async function setupBackend(harness: BackendHarness) {
  const backend = await harness.create();
  const controls = backend.controls;
  return {
    ...backend,
    // Only called from tests that run when supportsControls is true.
    controls: controls as BackendTestControls,
    email: harness.uniqueEmail(),
    signUp: async (email = harness.uniqueEmail()) =>
      expectUser(await backend.auth.signUp({ email, password: PASSWORD })),
  };
}

export function describeAuthServiceContract(name: string, harness: BackendHarness) {
  const withControls = harness.supportsControls ? it : it.skip;

  describe(`AuthService contract: ${name}`, () => {
    describe("signUp", () => {
      it("creates and signs in a user with a safe uid and the lowercased email", async () => {
        const { auth, email } = await setupBackend(harness);
        const listener = jest.fn();
        auth.subscribe(listener);

        const user = expectUser(await auth.signUp({ email: email.toUpperCase(), password: PASSWORD }));
        expect(user).toEqual({ uid: expect.stringMatching(UID_PATTERN), email, emailVerified: false });
        expect(auth.currentUser()).toEqual(user);
        expect(listener).toHaveBeenLastCalledWith(user);
      });

      it("returns the same currentUser object until the user changes", async () => {
        const { auth, signUp } = await setupBackend(harness);
        await signUp();
        expect(auth.currentUser()).toBe(auth.currentUser());
      });

      it("rejects an email that is already registered, in any case, without saying why", async () => {
        const { auth, email, signUp } = await setupBackend(harness);
        await signUp(email);
        expect(await auth.signUp({ email: email.toUpperCase(), password: NEW_PASSWORD })).toEqual({
          ok: false,
          error: "sign_up_failed",
        });
      });

      it.each([
        ["a bad email", { email: "not-an-email", password: PASSWORD }],
        ["SQL in the email", { email: "'; DROP TABLE recipes;--", password: PASSWORD }],
        ["HTML in the email", { email: "<script>alert(1)</script>@example.com", password: PASSWORD }],
        ["a short password", { password: "short" }],
        ["a very long password", { password: "a".repeat(129) }],
        ["nothing", null],
      ])("rejects %s and creates nothing", async (_label, input) => {
        const { auth, email } = await setupBackend(harness);
        const attempt = input === null ? null : { email, ...input };
        expect(await auth.signUp(attempt)).toEqual({ ok: false, error: "invalid_input" });
        expect(auth.currentUser()).toBeNull();
        expect(await auth.signIn({ email, password: PASSWORD })).toEqual({ ok: false, error: "invalid_credentials" });
      });
    });

    describe("signIn", () => {
      it("signs in with the right password, ignoring email case", async () => {
        const { auth, email, signUp } = await setupBackend(harness);
        const created = await signUp(email);
        await auth.signOut();
        const user = expectUser(await auth.signIn({ email: email.toUpperCase(), password: PASSWORD }));
        expect(user.uid).toBe(created.uid);
      });

      it("gives the same answer for a wrong password and an unknown email", async () => {
        const { auth, email, signUp } = await setupBackend(harness);
        await signUp(email);
        await auth.signOut();
        const wrongPassword = await auth.signIn({ email, password: "wrong password" });
        const unknownEmail = await auth.signIn({ email: harness.uniqueEmail(), password: PASSWORD });
        expect(wrongPassword).toEqual({ ok: false, error: "invalid_credentials" });
        expect(unknownEmail).toEqual(wrongPassword);
        expect(auth.currentUser()).toBeNull();
      });

      it("rejects invalid input without calling the server", async () => {
        const { auth } = await setupBackend(harness);
        expect(await auth.signIn({ email: "nope", password: PASSWORD })).toEqual({ ok: false, error: "invalid_input" });
        expect(await auth.signIn({ email: "a@b.co", password: "" })).toEqual({ ok: false, error: "invalid_input" });
      });
    });

    it("signOut clears the user and notifies listeners", async () => {
      const { auth, signUp } = await setupBackend(harness);
      await signUp();
      const listener = jest.fn();
      auth.subscribe(listener);
      await auth.signOut();
      expect(auth.currentUser()).toBeNull();
      expect(listener).toHaveBeenLastCalledWith(null);
    });

    it("password reset gives the same answer whether or not the account exists", async () => {
      const { auth, email, signUp } = await setupBackend(harness);
      await signUp(email);
      await auth.signOut();
      const existing = await auth.sendPasswordReset({ email });
      const unknown = await auth.sendPasswordReset({ email: harness.uniqueEmail() });
      expect(existing).toEqual({ ok: true });
      expect(unknown).toEqual(existing);
      expect(await auth.sendPasswordReset({ email: "<script>" })).toEqual({ ok: false, error: "invalid_input" });
    });

    it("re-authenticates only with the right password", async () => {
      const { auth, signUp } = await setupBackend(harness);
      await signUp();
      expect(await auth.reauthenticate({ password: "wrong password" })).toEqual({
        ok: false,
        error: "invalid_credentials",
      });
      expect(await auth.reauthenticate({ password: PASSWORD })).toEqual({ ok: true });
    });

    it("changes the password", async () => {
      const { auth, email, signUp } = await setupBackend(harness);
      await signUp(email);
      expect(await auth.changePassword({ newPassword: "short" })).toEqual({ ok: false, error: "invalid_input" });
      expect(await auth.changePassword({ newPassword: NEW_PASSWORD })).toEqual({ ok: true });
      await auth.signOut();
      expect(await auth.signIn({ email, password: PASSWORD })).toEqual({ ok: false, error: "invalid_credentials" });
      expectUser(await auth.signIn({ email, password: NEW_PASSWORD }));
    });

    it("deletes the sign-in account", async () => {
      const { auth, email, signUp } = await setupBackend(harness);
      await signUp(email);
      expect(await auth.deleteAuthUser()).toEqual({ ok: true });
      expect(auth.currentUser()).toBeNull();
      expect(await auth.signIn({ email, password: PASSWORD })).toEqual({ ok: false, error: "invalid_credentials" });
      // The email can be used again.
      await signUp(email);
    });

    it("sends a verification email to the signed-in user", async () => {
      const { auth, signUp } = await setupBackend(harness);
      await signUp();
      expect(await auth.sendVerificationEmail()).toEqual({ ok: true });
    });

    it("never includes the password in a result or the user", async () => {
      const { auth, email } = await setupBackend(harness);
      const results = [
        await auth.signUp({ email, password: PASSWORD }),
        auth.currentUser(),
        await auth.signUp({ email, password: PASSWORD }),
        await auth.reauthenticate({ password: PASSWORD }),
        await auth.signIn({ email, password: PASSWORD }),
      ];
      expect(JSON.stringify(results)).not.toContain(PASSWORD);
    });

    describe("with backend controls", () => {
      withControls("reports offline for server calls but still signs out", async () => {
        const { auth, email, signUp, controls } = await setupBackend(harness);
        await signUp(email);
        controls.setOffline(true);
        const offline = { ok: false, error: "offline" };
        expect(await auth.signUp({ email: harness.uniqueEmail(), password: PASSWORD })).toEqual(offline);
        expect(await auth.sendPasswordReset({ email })).toEqual(offline);
        expect(await auth.reauthenticate({ password: PASSWORD })).toEqual(offline);
        expect(await auth.changePassword({ newPassword: NEW_PASSWORD })).toEqual(offline);
        expect(await auth.deleteAuthUser()).toEqual(offline);
        await auth.signOut();
        expect(auth.currentUser()).toBeNull();
        expect(await auth.signIn({ email, password: PASSWORD })).toEqual(offline);
      });

      withControls("returns an injected failure once", async () => {
        const { auth, email, signUp, controls } = await setupBackend(harness);
        await signUp(email);
        await auth.signOut();
        controls.failNext("auth.signIn", "rate_limited");
        expect(await auth.signIn({ email, password: PASSWORD })).toEqual({ ok: false, error: "rate_limited" });
        expectUser(await auth.signIn({ email, password: PASSWORD }));
      });

      withControls("requires a recent login for sensitive changes", async () => {
        const { auth, signUp, controls } = await setupBackend(harness);
        await signUp();
        controls.advanceClock(6 * MINUTE);
        const stale = { ok: false, error: "requires_recent_login" };
        expect(await auth.changePassword({ newPassword: NEW_PASSWORD })).toEqual(stale);
        expect(await auth.deleteAuthUser()).toEqual(stale);
        expect(await auth.reauthenticate({ password: PASSWORD })).toEqual({ ok: true });
        expect(await auth.changePassword({ newPassword: NEW_PASSWORD })).toEqual({ ok: true });
      });

      withControls("throws only domain errors", async () => {
        const { auth, signUp, controls } = await setupBackend(harness);
        await signUp();
        controls.failNext("auth.signOut", "unknown");
        const caught = await auth.signOut().catch((error: unknown) => error);
        expect(isDomainError(caught)).toBe(true);
      });
    });
  });
}

export function describeUsernameRegistryContract(name: string, harness: BackendHarness) {
  const withControls = harness.supportsControls ? it : it.skip;

  describe(`UsernameRegistry contract: ${name}`, () => {
    it("reports an unclaimed name as available", async () => {
      const { usernames } = await setupBackend(harness);
      expect(await usernames.isAvailable(harness.uniqueUsername())).toBe("available");
    });

    it.each(["ab", "a".repeat(21), "has space", "'; DROP TABLE recipes;--", "<script>alert(1)</script>", "🍕🍕🍕", "", "../x", 42])(
      "rejects %p as invalid input",
      async (username) => {
        const { usernames } = await setupBackend(harness);
        expect(await usernames.isAvailable(username)).toBe("invalid_input");
      },
    );

    it("claims a name and creates the profile in the same write", async () => {
      const { usernames, signUp } = await setupBackend(harness);
      const user = await signUp();
      const username = harness.uniqueUsername();

      const result = await usernames.claim(user.uid, username.toUpperCase());
      if (!result.ok) throw new Error(`Expected a claim, got ${result.reason}`);
      expect(storedProfileSchema.safeParse(result.profile).success).toBe(true);
      expect(result.profile).toMatchObject({ username, dietaryRestrictions: null, schemaVersion: 1 });
      expect(result.profile.updatedAt).toBe(result.profile.createdAt);
    });

    it("treats names as the same regardless of letter case, for everyone", async () => {
      const { auth, usernames, signUp } = await setupBackend(harness);
      const username = harness.uniqueUsername();
      const first = await signUp();
      expect(await usernames.claim(first.uid, username)).toMatchObject({ ok: true });
      expect(await usernames.isAvailable(username.toUpperCase())).toBe("taken");

      await auth.signOut();
      const second = await signUp();
      expect(await usernames.claim(second.uid, username.toUpperCase())).toEqual({ ok: false, reason: "taken" });
    });

    it("only lets the signed-in user claim for their own uid", async () => {
      const { auth, usernames, signUp } = await setupBackend(harness);
      const first = await signUp();
      await auth.signOut();
      await signUp(); // someone else is now signed in
      const username = harness.uniqueUsername();
      expect(await usernames.claim(first.uid, username)).toEqual({ ok: false, reason: "not_owner" });
      expect(await usernames.isAvailable(username)).toBe("available");
    });

    it("gives each user at most one username", async () => {
      const { usernames, signUp } = await setupBackend(harness);
      const user = await signUp();
      const second = harness.uniqueUsername();
      expect(await usernames.claim(user.uid, harness.uniqueUsername())).toMatchObject({ ok: true });
      expect(await usernames.claim(user.uid, second)).toEqual({ ok: false, reason: "taken" });
      expect(await usernames.isAvailable(second)).toBe("available");
    });

    it("rejects an invalid uid or username", async () => {
      const { usernames, signUp } = await setupBackend(harness);
      const user = await signUp();
      const invalid = { ok: false, reason: "invalid_input" };
      expect(await usernames.claim("../x", harness.uniqueUsername())).toEqual(invalid);
      expect(await usernames.claim(user.uid, "ab")).toEqual(invalid);
      expect(await usernames.claim(user.uid, "'; DROP TABLE recipes;--")).toEqual(invalid);
      expect(await usernames.release("a/b", harness.uniqueUsername())).toEqual(invalid);
    });

    it("lets only the owner release a name", async () => {
      const { auth, usernames, email, signUp } = await setupBackend(harness);
      const owner = await signUp(email);
      const username = harness.uniqueUsername();
      await usernames.claim(owner.uid, username);
      await auth.signOut();

      const other = await signUp();
      expect(await usernames.release(other.uid, username)).toEqual({ ok: false, reason: "not_owner" });
      expect(await usernames.release(owner.uid, username)).toEqual({ ok: false, reason: "not_owner" });

      await auth.signOut();
      expectUser(await auth.signIn({ email, password: PASSWORD }));
      expect(await usernames.release(owner.uid, username)).toEqual({ ok: true });
      expect(await usernames.isAvailable(username)).toBe("available");
    });

    it("releasing a name that isn't claimed succeeds, so deletion can be retried", async () => {
      const { usernames, signUp } = await setupBackend(harness);
      const user = await signUp();
      expect(await usernames.release(user.uid, harness.uniqueUsername())).toEqual({ ok: true });
    });

    describe("with backend controls", () => {
      withControls("reports offline", async () => {
        const { usernames, signUp, controls } = await setupBackend(harness);
        const user = await signUp();
        const username = harness.uniqueUsername();
        controls.setOffline(true);
        expect(await usernames.isAvailable(username)).toBe("offline");
        expect(await usernames.claim(user.uid, username)).toEqual({ ok: false, reason: "offline" });
        expect(await usernames.release(user.uid, username)).toEqual({ ok: false, reason: "offline" });
      });

      withControls("never leaves half a claim behind", async () => {
        const { usernames, signUp, controls } = await setupBackend(harness);
        const user = await signUp();
        const username = harness.uniqueUsername();
        controls.failNext("usernames.claimCommit", "unknown");
        expect(await usernames.claim(user.uid, username)).toEqual({ ok: false, reason: "unknown" });
        // Neither document was written, so the name is free and the user can claim again.
        expect(await usernames.isAvailable(username)).toBe("available");
        expect(await usernames.claim(user.uid, username)).toMatchObject({ ok: true });
      });

      withControls("sign up halfway: the auth user exists, the claim fails, the name stays free", async () => {
        const { auth, usernames, signUp, controls } = await setupBackend(harness);
        const user = await signUp();
        const username = harness.uniqueUsername();
        controls.failNext("usernames.claim", "offline");
        expect(await usernames.claim(user.uid, username)).toEqual({ ok: false, reason: "offline" });
        expect(auth.currentUser()).toEqual(user);
        expect(await usernames.isAvailable(username)).toBe("available");
      });
    });
  });
}

export function describeRemoteProfileStoreContract(name: string, harness: BackendHarness) {
  const withControls = harness.supportsControls ? it : it.skip;

  describe(`RemoteProfileStore contract: ${name}`, () => {
    it("has no profile before a username is claimed", async () => {
      const { remoteProfiles, signUp } = await setupBackend(harness);
      const user = await signUp();
      expect(await remoteProfiles.fetch(user.uid)).toEqual({ ok: true, profile: null });
    });

    it("returns the profile created by the claim, validated", async () => {
      const { usernames, remoteProfiles, signUp } = await setupBackend(harness);
      const user = await signUp();
      const claim = await usernames.claim(user.uid, harness.uniqueUsername());
      if (!claim.ok) throw new Error(`Expected a claim, got ${claim.reason}`);

      const fetched = await remoteProfiles.fetch(user.uid);
      expect(fetched).toEqual({ ok: true, profile: claim.profile });
    });

    it("only returns the signed-in user's own profile", async () => {
      const { auth, usernames, remoteProfiles, signUp } = await setupBackend(harness);
      const owner = await signUp();
      await usernames.claim(owner.uid, harness.uniqueUsername());
      await auth.signOut();
      expect(await remoteProfiles.fetch(owner.uid)).toEqual({ ok: false, reason: "not_owner" });
      await signUp();
      expect(await remoteProfiles.fetch(owner.uid)).toEqual({ ok: false, reason: "not_owner" });
    });

    it.each(["", "../x", "a/b", "'; DROP TABLE recipes;--"])("rejects uid %p", async (uid) => {
      const { remoteProfiles, signUp } = await setupBackend(harness);
      await signUp();
      expect(await remoteProfiles.fetch(uid)).toEqual({ ok: false, reason: "invalid_input" });
    });

    it("deletes only the signed-in user's own profile, and deleting twice succeeds", async () => {
      const { auth, usernames, remoteProfiles, email, signUp } = await setupBackend(harness);
      const owner = await signUp(email);
      await usernames.claim(owner.uid, harness.uniqueUsername());
      await auth.signOut();

      const other = await signUp();
      expect(await remoteProfiles.delete(owner.uid)).toEqual({ ok: false, reason: "not_owner" });
      expect(await remoteProfiles.delete("../x")).toEqual({ ok: false, reason: "invalid_input" });

      await auth.signOut();
      expectUser(await auth.signIn({ email, password: PASSWORD }));
      expect(await remoteProfiles.delete(owner.uid)).toEqual({ ok: true });
      expect(await remoteProfiles.fetch(owner.uid)).toEqual({ ok: true, profile: null });
      expect(await remoteProfiles.delete(owner.uid)).toEqual({ ok: true });
      expect(other.uid).not.toBe(owner.uid);
    });

    withControls("reports offline", async () => {
      const { remoteProfiles, signUp, controls } = await setupBackend(harness);
      const user = await signUp();
      controls.setOffline(true);
      expect(await remoteProfiles.fetch(user.uid)).toEqual({ ok: false, reason: "offline" });
      expect(await remoteProfiles.delete(user.uid)).toEqual({ ok: false, reason: "offline" });
    });
  });
}

export function describeRemoteUserContentContract(name: string, harness: BackendHarness) {
  const withControls = harness.supportsControls ? it : it.skip;

  describe(`RemoteUserContent contract: ${name}`, () => {
    it("deletes the signed-in user's content, and deleting again succeeds", async () => {
      const { remoteContent, signUp } = await setupBackend(harness);
      const user = await signUp();
      expect(await remoteContent.deleteAll(user.uid)).toEqual({ ok: true });
      expect(await remoteContent.deleteAll(user.uid)).toEqual({ ok: true });
    });

    it("refuses someone else's content and unsafe uids", async () => {
      const { auth, remoteContent, signUp } = await setupBackend(harness);
      const owner = await signUp();
      await auth.signOut();
      await signUp();
      expect(await remoteContent.deleteAll(owner.uid)).toEqual({ ok: false, reason: "not_owner" });
      expect(await remoteContent.deleteAll("a/b")).toEqual({ ok: false, reason: "invalid_input" });
    });

    withControls("reports offline", async () => {
      const { remoteContent, signUp, controls } = await setupBackend(harness);
      const user = await signUp();
      controls.setOffline(true);
      expect(await remoteContent.deleteAll(user.uid)).toEqual({ ok: false, reason: "offline" });
    });
  });
}
