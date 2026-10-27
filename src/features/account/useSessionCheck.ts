import type { SessionCheck } from "@/services/session/sessionGuard";
import { useSessionGuard } from "@/services/ServiceProvider";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useAuthUser } from "./useAuthUser";

// Runs the 30-day session check (N-15) on app start, when the signed-in user changes,
// and whenever the app returns to the foreground. null until the first check finishes.
export function useSessionCheck(): SessionCheck | null {
  const guard = useSessionGuard();
  const uid = useAuthUser()?.uid;
  const [check, setCheck] = useState<SessionCheck | null>(null);

  useEffect(() => {
    let active = true;
    const run = () => {
      guard.check().then(
        (result) => {
          if (active) setCheck(result);
        },
        // Keep the last result; the check runs again on the next foreground.
        () => {},
      );
    };
    run();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [guard, uid]);

  return check;
}
