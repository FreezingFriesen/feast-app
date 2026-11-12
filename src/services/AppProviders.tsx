import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SessionStatusProvider } from "@/features/account/SessionStatusProvider";
import { RepositoryProvider } from "@/repositories/RepositoryProvider";
import { openAppDatabase } from "@/storage/expoSqliteDatabase";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState, type ReactNode } from "react";
import { createExpoNetworkConnectivity } from "./connectivity/expoNetworkConnectivity";
import { createAppServices, DEV_LATENCY_MS, resolveBackend, type AppServices } from "./createAppServices";
import { isDomainError } from "./domainErrors";
import { ServiceProvider } from "./ServiceProvider";
import { expoSecureKeyValue } from "./session/expoSecureKeyValue";

// Where startup has got to. noBackend: the failure was a missing or refused backend
// setting, which gets its own message.
type Startup =
  | { status: "loading" }
  | { status: "ready"; app: AppServices }
  | { status: "failed"; noBackend: boolean };

// The splash screen hides once startup has finished, or after this long at most, so a
// startup that never finishes can't leave the splash up for ever.
const SPLASH_TIMEOUT_MS = 10_000;

// Everything that has to happen before the first screen: pick the backend, open the
// database on the phone, build the services, and restore a saved login.
async function startApp(): Promise<AppServices> {
  // Read here and nowhere else. EXPO_PUBLIC_ values are inlined at build time, so the
  // variable has to be written out in full.
  const backend = resolveBackend(process.env.EXPO_PUBLIC_BACKEND, __DEV__);
  const database = await openAppDatabase();
  const app = createAppServices({
    backend,
    database,
    secure: expoSecureKeyValue,
    connectivity: createExpoNetworkConnectivity(),
    latencyMs: backend === "memory" ? DEV_LATENCY_MS : 0,
  });
  // Restores a saved session before the first screen. (A missing Firebase setting has
  // already failed above, in createAppServices, which shows the error screen.)
  await app.services.auth.whenReady();
  return app;
}

// Opens the local database, builds the services and provides them to every screen.
export function AppProviders({ children }: { children: ReactNode }) {
  const [startup, setStartup] = useState<Startup>({ status: "loading" });

  // Start the app once, when this first appears. "active" ignores the result if it
  // goes away before startup finishes.
  useEffect(() => {
    let active = true;
    startApp().then(
      (app) => {
        if (active) setStartup({ status: "ready", app });
      },
      // Not logged: the error could contain details that don't belong in logs.
      (error: unknown) => {
        const noBackend = isDomainError(error) && error.code === "backend_not_configured";
        if (active) setStartup({ status: "failed", noBackend });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  // The splash screen (held in src/app/_layout.tsx) covers startup. Hide it when
  // startup has worked or failed, so the first screen or the error shows, and in any
  // case after SPLASH_TIMEOUT_MS.
  const starting = startup.status === "loading";
  useEffect(() => {
    if (!starting) {
      SplashScreen.hide();
      return;
    }
    const timer = setTimeout(() => SplashScreen.hide(), SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [starting]);

  // Once started, sync recipes and meal plans in the foreground (N-19): straight away if a
  // saved login was restored, and on sign in, reconnecting and local changes after that.
  // Stops listening if this goes away.
  useEffect(() => {
    if (startup.status !== "ready") return;
    return startup.app.syncEngine.start();
  }, [startup]);

  // Nothing is drawn while starting. If startup failed, show why instead of the app.
  if (startup.status === "loading") return null;
  if (startup.status === "failed") {
    return startup.noBackend ? (
      <PlaceholderScreen
        title="No backend configured"
        description={
          __DEV__
            ? "Check EXPO_PUBLIC_BACKEND and the Firebase values in .env.local, then restart with: npx expo start -c"
            : "This build isn't connected to a backend."
        }
      />
    ) : (
      <PlaceholderScreen title="Feast couldn't start" description="Please close the app and open it again." />
    );
  }

  // Ready: share the repositories and services with every screen, and start the
  // 30-day session check.
  return (
    <RepositoryProvider repositories={startup.app.repositories}>
      <ServiceProvider services={startup.app.services}>
        <SessionStatusProvider>{children}</SessionStatusProvider>
      </ServiceProvider>
    </RepositoryProvider>
  );
}
