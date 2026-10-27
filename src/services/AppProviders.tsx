import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SessionStatusProvider } from "@/features/account/SessionStatusProvider";
import { RepositoryProvider } from "@/repositories/RepositoryProvider";
import { openAppDatabase } from "@/storage/expoSqliteDatabase";
import { useEffect, useState, type ReactNode } from "react";
import { createExpoNetworkConnectivity } from "./connectivity/expoNetworkConnectivity";
import { createAppServices, DEV_LATENCY_MS, resolveBackend, type AppServices } from "./createAppServices";
import { isDomainError } from "./domainErrors";
import { ServiceProvider } from "./ServiceProvider";
import { expoSecureKeyValue } from "./session/expoSecureKeyValue";

type Startup =
  | { status: "loading" }
  | { status: "ready"; app: AppServices }
  | { status: "failed"; noBackend: boolean };

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
  // Restores a saved session. The Firebase stub fails here, so an unconfigured
  // backend shows the error screen straight away.
  await app.services.auth.whenReady();
  return app;
}

// Opens the local database, builds the services and provides them to every screen.
export function AppProviders({ children }: { children: ReactNode }) {
  const [startup, setStartup] = useState<Startup>({ status: "loading" });

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

  if (startup.status === "loading") return null;
  if (startup.status === "failed") {
    return startup.noBackend ? (
      <PlaceholderScreen
        title="No backend configured"
        description={
          __DEV__
            ? "Set EXPO_PUBLIC_BACKEND to memory (the default) until the Firebase backend exists."
            : "This build isn't connected to a backend."
        }
      />
    ) : (
      <PlaceholderScreen title="Feast couldn't start" description="Please close the app and open it again." />
    );
  }

  return (
    <RepositoryProvider repositories={startup.app.repositories}>
      <ServiceProvider services={startup.app.services}>
        <SessionStatusProvider>{children}</SessionStatusProvider>
      </ServiceProvider>
    </RepositoryProvider>
  );
}
