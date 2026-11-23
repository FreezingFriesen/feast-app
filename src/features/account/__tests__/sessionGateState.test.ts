import type { SessionCheck } from "@/services/session/sessionGuard";
import {
  INITIAL_SESSION_GATE,
  latestSessionCheck,
  reduceSessionGate,
  type SessionGateModel,
} from "../gate/sessionGateState";

const active: SessionCheck = { state: "active", expiresAt: 1_000 };
const expired: SessionCheck = { state: "ended", reason: "expired" };
const signedOut: SessionCheck = { state: "signed_out" };

describe("reduceSessionGate", () => {
  it("starts out checking, with nothing ended", () => {
    expect(INITIAL_SESSION_GATE).toEqual({ gate: { status: "checking" }, ended: null });
    expect(latestSessionCheck(INITIAL_SESSION_GATE)).toBeNull();
  });

  it("records the current user's result", () => {
    const model = reduceSessionGate(INITIAL_SESSION_GATE, { type: "result", uid: "u1", check: active, current: true });
    expect(model).toEqual({ gate: { status: "checked", uid: "u1", check: active }, ended: null });
    expect(latestSessionCheck(model)).toEqual(active);
  });

  it("keeps why a session ended even though its own sign out made the result stale", () => {
    // The check for u1 signed u1 out, so by the time it finishes u1 is no longer current.
    const afterEnd = reduceSessionGate(INITIAL_SESSION_GATE, {
      type: "result",
      uid: "u1",
      check: expired,
      current: false,
    });
    expect(afterEnd.ended).toEqual(expired);
    // The gate still waits: the stale result doesn't count as a check for anyone.
    expect(afterEnd.gate).toEqual({ status: "checking" });
    // The re-run for nobody signed in arrives; the reason stays for the welcome screen.
    const settled = reduceSessionGate(afterEnd, { type: "result", uid: null, check: signedOut, current: true });
    expect(settled).toEqual({ gate: { status: "checked", uid: null, check: signedOut }, ended: expired });
  });

  it("clears the reason once a new session is active", () => {
    const ended: SessionGateModel = { gate: { status: "checked", uid: null, check: signedOut }, ended: expired };
    const next = reduceSessionGate(ended, { type: "result", uid: "u2", check: active, current: true });
    expect(next.ended).toBeNull();
  });

  it("doesn't clear the reason for a stale active result", () => {
    const ended: SessionGateModel = { gate: { status: "checked", uid: null, check: signedOut }, ended: expired };
    expect(reduceSessionGate(ended, { type: "result", uid: "u2", check: active, current: false })).toBe(ended);
  });

  it("ignores a stale result that isn't an ended session", () => {
    const model: SessionGateModel = { gate: { status: "checked", uid: "u2", check: active }, ended: null };
    expect(reduceSessionGate(model, { type: "result", uid: "u1", check: signedOut, current: false })).toBe(model);
  });

  it("marks the current user's check as failed when it throws, and ignores a stale error", () => {
    const failed = reduceSessionGate(INITIAL_SESSION_GATE, { type: "error", uid: "u1", current: true });
    expect(failed.gate).toEqual({ status: "failed", uid: "u1" });
    const model: SessionGateModel = { gate: { status: "checked", uid: "u2", check: active }, ended: null };
    expect(reduceSessionGate(model, { type: "error", uid: "u1", current: false })).toBe(model);
  });
});
