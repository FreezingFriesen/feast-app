import type { UsernameAvailability } from "@/services/usernames/UsernameRegistry";
import { useUsernameRegistry } from "@/services/ServiceProvider";
import { usernameSchema } from "@/validation/authSchema";
import { useEffect, useState } from "react";

// idle: nothing typed. invalid: doesn't meet the rules yet (shown as a hint, not an error).
export type UsernameCheck = "idle" | "invalid" | "checking" | "available" | "taken" | "offline" | "error";

// Wait for a pause in typing, so each keystroke isn't a server call.
const CHECK_DELAY_MS = 500;

const toCheck = (availability: UsernameAvailability): UsernameCheck => {
  switch (availability) {
    case "available":
    case "taken":
    case "offline":
      return availability;
    case "invalid_input":
      return "invalid";
    default:
      return "error";
  }
};

// Live feedback while typing a username (N-13). Only a hint: the claim at sign up is
// what actually guarantees the name.
export function useUsernameAvailability(typed: string): UsernameCheck {
  const usernames = useUsernameRegistry();
  const parsed = usernameSchema.safeParse(typed);
  const candidate = parsed.success ? parsed.data : null;
  const [result, setResult] = useState<{ username: string; check: UsernameCheck } | null>(null);

  useEffect(() => {
    if (candidate === null) return;
    let active = true;
    const timer = setTimeout(() => {
      usernames.isAvailable(candidate).then(
        (availability) => {
          if (active) setResult({ username: candidate, check: toCheck(availability) });
        },
        () => {
          if (active) setResult({ username: candidate, check: "error" });
        },
      );
    }, CHECK_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [usernames, candidate]);

  if (typed.trim() === "") return "idle";
  if (candidate === null) return "invalid";
  return result?.username === candidate ? result.check : "checking";
}
