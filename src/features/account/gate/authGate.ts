// The auth gate (N-14, N-15): decides whether the app shows the tabs, the welcome
// screens or the username step. An account is required to use the app.
//
// Plain functions with no React or Expo imports, so every rule is tested on its own
// (src/features/account/__tests__/authGate.test.ts). It fails closed: only a session the
// 30-day check has confirmed for the signed-in user ever reaches "app".
import type { SessionCheck } from "@/services/session/sessionGuard";
import type { AccountProfile } from "../useAccountProfile";

// splash: the first session check hasn't finished; nothing is drawn and the splash
//         screen stays up.
// welcome: the welcome, log in, sign up and forgot password screens.
// username: signed in, but sign up stopped before a username was saved.
// app: the tabs.
export type AuthRoute = "splash" | "welcome" | "username" | "app";

// The latest 30-day session check, and which user it was for.
// checking: the first check since the app started hasn't finished.
// checked: the result of the latest check for that uid (null = nobody signed in).
// failed: the check itself threw (e.g. secure storage couldn't be read).
export type SessionGateState =
  | { status: "checking" }
  | { status: "checked"; uid: string | null; check: SessionCheck }
  | { status: "failed"; uid: string | null };

export type AuthGateInput = {
  // The signed-in user's uid, or null.
  uid: string | null;
  session: SessionGateState;
  profile: AccountProfile["status"];
  // True while a log in, sign up or choose-username is running on screen.
  authInProgress: boolean;
};

// Where the app should be. `previous` is the last route this returned (start with
// "splash"), so states that are still loading keep the screen where it is instead of
// flashing another one.
export function deriveAuthRoute(input: AuthGateInput, previous: AuthRoute): AuthRoute {
  const { uid, session, profile, authInProgress } = input;

  // 1. The first check hasn't finished: keep the splash up.
  if (session.status === "checking") return "splash";
  // 2. Nobody signed in.
  if (uid === null) return "welcome";
  // 3. The check threw: never let them in on an error.
  if (session.status === "failed") return "welcome";
  // 4. Not confirmed for this user yet (just signed in), or the session has ended.
  if (session.uid !== uid || session.check.state !== "active") {
    return previous === "splash" ? "splash" : "welcome";
  }
  // 5. A log in, sign up or username step is still running: stay on that screen until
  //    it finishes, so a half-finished sign up doesn't flash the username step.
  if (authInProgress) return previous === "username" ? "username" : "welcome";
  // The profile hook reads the same signed-in user, so this can't really disagree with
  // uid; if it ever did, treat it as signed out.
  if (profile === "signed_out") return "welcome";
  // 6. Signed in, but the account has no username yet.
  if (profile === "needs_username") return "username";
  // 7. The profile is still being read: stay where we are. At start that's the splash,
  //    so the welcome screen never flashes before the tabs.
  if (profile === "loading") return previous;
  // 8. A confirmed session with a profile, or one that can't be downloaded right now
  //    (offline-first: the session is valid, so the app works without it).
  return "app";
}

// Where a link to a screen that isn't available goes (a deep link, Android Back, a
// stale navigation state): the first screen of the area the user is allowed in.
export function notFoundRedirect(route: AuthRoute): "/recipes" | "/welcome" | "/choose-username" | null {
  switch (route) {
    case "app":
      return "/recipes";
    case "welcome":
      return "/welcome";
    case "username":
      return "/choose-username";
    case "splash":
      return null;
  }
}
