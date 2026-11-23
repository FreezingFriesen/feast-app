// The state behind the app-wide 30-day session check (N-15), as a plain reducer so it
// can be tested without React (src/features/account/__tests__/sessionGateState.test.ts).
import type { SessionCheck } from "@/services/session/sessionGuard";
import type { SessionGateState } from "./authGate";

// Why the last session ended, kept so the welcome screen can say so.
export type EndedSession = Extract<SessionCheck, { state: "ended" }>;

export type SessionGateModel = {
  gate: SessionGateState;
  ended: EndedSession | null;
};

// One finished check. `uid` is who it ran for. `current` is false when the signed-in
// user has changed since it started (its result no longer describes who is signed in).
export type SessionGateEvent =
  | { type: "result"; uid: string | null; check: SessionCheck; current: boolean }
  | { type: "error"; uid: string | null; current: boolean };

export const INITIAL_SESSION_GATE: SessionGateModel = { gate: { status: "checking" }, ended: null };

export function reduceSessionGate(model: SessionGateModel, event: SessionGateEvent): SessionGateModel {
  if (event.type === "result") {
    // An ended session is kept even though it's no longer current: the check signed the
    // user out itself, which changed the uid while it was finishing.
    // A new active session for the signed-in user clears it.
    const ended =
      event.check.state === "ended"
        ? event.check
        : event.current && event.check.state === "active"
          ? null
          : model.ended;
    if (!event.current) return ended === model.ended ? model : { ...model, ended };
    return { gate: { status: "checked", uid: event.uid, check: event.check }, ended };
  }
  // A check that threw. Only the current user's counts; an older one is ignored.
  if (!event.current) return model;
  return { ...model, gate: { status: "failed", uid: event.uid } };
}

// The latest result as SessionCheck (for "Signed in until …"), or null if there isn't one.
export function latestSessionCheck(model: SessionGateModel): SessionCheck | null {
  if (model.gate.status === "checked") return model.gate.check;
  return model.ended;
}
