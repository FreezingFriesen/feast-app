import type { AuthUser } from "@/services/auth/AuthService";
import { useAuthService } from "@/services/ServiceProvider";
import { useSyncExternalStore } from "react";

// The signed-in user, or null. Updates when the user signs in or out.
export function useAuthUser(): AuthUser | null {
  const auth = useAuthService();
  return useSyncExternalStore(auth.subscribe, auth.currentUser);
}
