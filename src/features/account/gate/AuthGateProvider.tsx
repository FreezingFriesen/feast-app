import * as SplashScreen from "expo-splash-screen";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSessionGate } from "../SessionStatusProvider";
import { useAccountProfile } from "../useAccountProfile";
import { useAuthUser } from "../useAuthUser";
import { deriveAuthRoute, type AuthRoute } from "./authGate";
import { welcomeNotice, type AccountNotice, type WelcomeNotice } from "./welcomeNotice";

type AuthGateValue = {
  route: AuthRoute;
  // Runs a log in, sign up or choose-username, and keeps the auth screens up until it
  // finishes, so the gate doesn't switch screens half way through.
  holdWhile<T>(run: () => Promise<T>): Promise<T>;
  notice: WelcomeNotice | null;
  showNotice(notice: AccountNotice | null): void;
};

const AuthGateContext = createContext<AuthGateValue | null>(null);

// Decides, from the signed-in user, the 30-day session check and the profile, whether
// the app shows the tabs, the welcome screens or the username step (N-14, N-15). It is
// worked out again on every change, never stored. The rules are in authGate.ts.
export function AuthGateProvider({ children }: { children: ReactNode }) {
  const uid = useAuthUser()?.uid ?? null;
  const session = useSessionGate();
  const profile = useAccountProfile().status;
  const [holds, setHolds] = useState(0);
  const [accountNotice, setAccountNotice] = useState<AccountNotice | null>(null);

  // The route this returned last time, so loading states keep the current screen.
  // Updated during render (React's "storing information from previous renders"
  // pattern), so there's never a frame with the old route, e.g. the tabs after log out.
  const [previous, setPrevious] = useState<AuthRoute>("splash");
  const route = deriveAuthRoute({ uid, session: session.gate, profile, authInProgress: holds > 0 }, previous);
  if (route !== previous) setPrevious(route);
  // A deleted account's note is cleared once someone is in the app again.
  if (route === "app" && accountNotice !== null) setAccountNotice(null);

  // The splash (held in src/app/_layout.tsx) stays up until the first decision, so the
  // tabs or the welcome screen never flash before the session check finishes.
  // AppProviders still hides it after 10 s at most.
  useEffect(() => {
    if (route !== "splash") SplashScreen.hide();
  }, [route]);

  const value: AuthGateValue = {
    route,
    holdWhile: async (run) => {
      setHolds((count) => count + 1);
      try {
        return await run();
      } finally {
        setHolds((count) => count - 1);
      }
    },
    notice: welcomeNotice(accountNotice, session.ended),
    showNotice: setAccountNotice,
  };
  return <AuthGateContext.Provider value={value}>{children}</AuthGateContext.Provider>;
}

function useAuthGate(): AuthGateValue {
  const value = useContext(AuthGateContext);
  if (!value) throw new Error("Auth gate hooks must be used inside AuthGateProvider");
  return value;
}

// Where the app should be: "splash", "welcome", "username" or "app".
export function useAuthRoute(): AuthRoute {
  return useAuthGate().route;
}

// Wraps a log in, sign up or choose-username so the gate waits for it to finish.
export function useHoldAuthGate(): AuthGateValue["holdWhile"] {
  return useAuthGate().holdWhile;
}

// The note for the welcome screen, and a way for the delete account screen to set one.
export function useWelcomeNotice(): Pick<AuthGateValue, "notice" | "showNotice"> {
  const { notice, showNotice } = useAuthGate();
  return { notice, showNotice };
}
