import type { SessionCheck } from "@/services/session/sessionGuard";
import { createContext, useContext, type ReactNode } from "react";
import { latestSessionCheck, type SessionGateModel } from "./gate/sessionGateState";
import { useSessionCheck } from "./useSessionCheck";

// Shares the latest check with every screen below the provider, without passing it
// down by hand.
const SessionStatusContext = createContext<SessionGateModel | null>(null);

// Runs the 30-day session check (N-15) once for the whole app, so it also happens
// when the Account tab isn't open.
export function SessionStatusProvider({ children }: { children: ReactNode }) {
  const status = useSessionCheck();
  return <SessionStatusContext.Provider value={status}>{children}</SessionStatusContext.Provider>;
}

// The whole session state, for the auth gate: the latest check (and who it was for),
// and why the last session ended.
export function useSessionGate(): SessionGateModel {
  const model = useContext(SessionStatusContext);
  if (!model) throw new Error("useSessionGate must be used inside SessionStatusProvider");
  return model;
}

// The latest session check: "Signed in until …", or why the session ended.
// null until the first check finishes.
export function useSessionStatus(): SessionCheck | null {
  const model = useContext(SessionStatusContext);
  return model ? latestSessionCheck(model) : null;
}
