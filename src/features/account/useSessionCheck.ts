import { useAuthService, useSessionGuard } from "@/services/ServiceProvider";
import { useEffect, useReducer } from "react";
import { AppState } from "react-native";
import { INITIAL_SESSION_GATE, reduceSessionGate, type SessionGateModel } from "./gate/sessionGateState";
import { useAuthUser } from "./useAuthUser";

// Runs the 30-day session check (N-15) on app start, when the signed-in user changes,
// and whenever the app returns to the foreground. The auth gate waits for the first
// result before showing anything (src/features/account/gate/authGate.ts).
export function useSessionCheck(): SessionGateModel {
  const guard = useSessionGuard();
  const auth = useAuthService();
  const uid = useAuthUser()?.uid ?? null;
  const [model, dispatch] = useReducer(reduceSessionGate, INITIAL_SESSION_GATE);

  // Runs again whenever the signed-in user changes (uid). Once this is cleaned up,
  // "current" is false: a result that arrives later no longer describes who is signed
  // in, and the reducer keeps only what still matters from it (why a session ended).
  useEffect(() => {
    let current = true;
    const run = () => {
      guard.check().then(
        (check) => dispatch({ type: "result", uid, check, current }),
        () => {
          dispatch({ type: "error", uid, current });
          // Fail closed: the gate shows the welcome screen, so sign out too (best
          // effort), so the gate and the sync engine agree that nobody is signed in.
          // Local data is never wiped here. Not logged: the error could hold details
          // that don't belong in logs.
          if (current && uid !== null) auth.signOut().catch(() => {});
        },
      );
    };
    run();
    // AppState says when the app moves between the foreground and the background.
    // "active" means the user has just come back to it.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    return () => {
      current = false;
      subscription.remove();
    };
  }, [guard, auth, uid]);

  return model;
}
