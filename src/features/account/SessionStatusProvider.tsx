import type { SessionCheck } from "@/services/session/sessionGuard";
import { createContext, useContext, type ReactNode } from "react";
import { useSessionCheck } from "./useSessionCheck";

const SessionStatusContext = createContext<SessionCheck | null>(null);

// Runs the 30-day session check (N-15) once for the whole app, so it also happens
// when the Account tab isn't open.
export function SessionStatusProvider({ children }: { children: ReactNode }) {
  const status = useSessionCheck();
  return <SessionStatusContext.Provider value={status}>{children}</SessionStatusContext.Provider>;
}

// The latest session check: "Signed in until …", or why the session ended.
// null until the first check finishes.
export function useSessionStatus(): SessionCheck | null {
  return useContext(SessionStatusContext);
}
