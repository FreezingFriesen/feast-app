import type { Profile } from "@/repositories/ProfileRepository";
import { useProfileRepository } from "@/repositories/RepositoryProvider";
import { refreshProfile, type ProfileState } from "@/services/account/signInFlow";
import type { AuthUser } from "@/services/auth/AuthService";
import { useRemoteProfileStore } from "@/services/ServiceProvider";
import { useEffect, useState } from "react";
import { useAuthUser } from "./useAuthUser";

export type AccountProfile =
  | { status: "signed_out" }
  | { status: "loading"; user: AuthUser }
  | { status: "ready"; user: AuthUser; profile: Profile }
  // Signed in, but the account has no username yet (sign up stopped half way).
  | { status: "needs_username"; user: AuthUser }
  // No copy on the device and it couldn't be downloaded (e.g. offline).
  | { status: "unavailable"; user: AuthUser; retry: () => void };

// The signed-in user and their profile. Reads the device copy first (works offline) and
// downloads it only when there is no copy on the device (#19).
export function useAccountProfile(): AccountProfile {
  const user = useAuthUser();
  const uid = user?.uid;
  const profiles = useProfileRepository();
  const remoteProfiles = useRemoteProfileStore();
  const [local, setLocal] = useState<{ uid: string; profile: Profile | undefined } | null>(null);
  const [download, setDownload] = useState<{ uid: string; attempt: number; state: ProfileState } | null>(null);
  const [attempt, setAttempt] = useState(0);

  // The device copy, reloaded after every change.
  useEffect(() => {
    if (!uid) return;
    let active = true;
    const load = () => {
      profiles.get(uid).then((profile) => {
        if (active) setLocal({ uid, profile });
      });
    };
    load();
    const unsubscribe = profiles.subscribe(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [profiles, uid]);

  const missingOnDevice = uid !== undefined && local?.uid === uid && local.profile === undefined;

  useEffect(() => {
    if (!uid || !missingOnDevice) return;
    let active = true;
    refreshProfile({ profiles, remoteProfiles }, uid).then(
      (state) => {
        if (active) setDownload({ uid, attempt, state });
      },
      () => {
        if (active) setDownload({ uid, attempt, state: "unavailable" });
      },
    );
    return () => {
      active = false;
    };
  }, [profiles, remoteProfiles, uid, missingOnDevice, attempt]);

  if (!user) return { status: "signed_out" };
  if (local?.uid !== user.uid) return { status: "loading", user };
  if (local.profile) return { status: "ready", user, profile: local.profile };
  if (download?.uid !== user.uid || download.attempt !== attempt || download.state === "ready") {
    return { status: "loading", user };
  }
  if (download.state === "needs_username") return { status: "needs_username", user };
  return { status: "unavailable", user, retry: () => setAttempt((count) => count + 1) };
}
