// Any link to a screen that isn't available right now: a deep link (feastapp://...),
// Android Back or a stale navigation state, e.g. a recipe link while signed out, or the
// log in screen while signed in. Goes to the first screen the user is allowed to see.
import { notFoundRedirect } from "@/features/account/gate/authGate";
import { useAuthRoute } from "@/features/account/gate/AuthGateProvider";
import { Redirect } from "expo-router";

export default function NotFoundScreen() {
  const target = notFoundRedirect(useAuthRoute());
  return target ? <Redirect href={target} /> : null;
}
