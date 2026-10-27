import type { DomainErrorCode } from "@/services/domainErrors";

// The signed-in user as screens see it. Never includes tokens.
export type AuthUser = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
};

// Why an auth call failed. The UI picks the message. These are deliberately coarse so
// messages never reveal whether an account exists: a wrong email and a wrong password are
// both invalid_credentials, and an email that is already registered is sign_up_failed.
// invalid_input means the input failed our schema, so the server was never called.
// requires_recent_login also covers "nobody is signed in".
export const AUTH_ERROR_CODES = [
  "invalid_input",
  "invalid_credentials",
  "sign_up_failed",
  "requires_recent_login",
  "rate_limited",
  "offline",
  "unknown",
] as const satisfies readonly DomainErrorCode[];
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export type AuthResult = { ok: true } | { ok: false; error: AuthErrorCode };
export type AuthUserResult = { ok: true; user: AuthUser } | { ok: false; error: AuthErrorCode };

// Screens depend on this interface only. Implementations (in-memory now, Firebase later)
// are picked in createAppServices, so moving to React Native Firebase only changes them.
// Inputs are untrusted: each method validates with authSchema before calling the server.
// Expected failures are returned as results; anything thrown is a DomainError.
export type AuthService = {
  // Resolves once a saved session has been restored (or found missing) at app start.
  whenReady(): Promise<void>;
  // Returns the same object until the user changes, so it can back useSyncExternalStore.
  currentUser(): AuthUser | null;
  // Calls the listener when the user signs in or out. Returns an unsubscribe function.
  subscribe(listener: (user: AuthUser | null) => void): () => void;
  signUp(input: unknown): Promise<AuthUserResult>; // newAccountSchema
  signIn(input: unknown): Promise<AuthUserResult>; // signInSchema
  // Works offline.
  signOut(): Promise<void>;
  // Same result whether or not an account exists for the email (N-16).
  sendPasswordReset(input: unknown): Promise<AuthResult>; // passwordResetSchema
  // Needed before changePassword, changing email and deleteAuthUser.
  reauthenticate(input: unknown): Promise<AuthResult>; // reauthSchema
  changePassword(input: unknown): Promise<AuthResult>; // newPasswordSchema
  deleteAuthUser(): Promise<AuthResult>;
  sendVerificationEmail(): Promise<AuthResult>;
};
