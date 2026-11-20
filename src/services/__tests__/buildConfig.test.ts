/// <reference types="node" />
// The demo build (N-22) is configured in app.json and eas.json, which nothing else
// checks until a cloud build runs. These checks catch the mistakes that would cost a
// build, or ship a build that can't start, before it's queued.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveBackend } from "../createAppServices";

const REPO_ROOT = join(__dirname, "../../..");
const readJson = (file: string) => JSON.parse(readFileSync(join(REPO_ROOT, file), "utf8"));
const app = readJson("app.json").expo;
const eas = readJson("eas.json");
const demo = eas.build.demo;

// Permanent once registered with Apple or installed from an APK. Changing it makes a
// different app.
const APP_ID = "ca.feastapp.feast";

describe("app.json for store and standalone builds", () => {
  it("uses the same permanent ID on iOS and Android", () => {
    expect(app.ios.bundleIdentifier).toBe(APP_ID);
    expect(app.android.package).toBe(APP_ID);
  });

  it("declares no non-exempt encryption (HTTPS only), so App Store Connect doesn't ask on every build", () => {
    expect(app.ios.config.usesNonExemptEncryption).toBe(false);
  });

  it("leaves build numbers to EAS (remote), so app.json holds none that would be ignored", () => {
    expect(eas.cli.appVersionSource).toBe("remote");
    expect(app.ios.buildNumber).toBeUndefined();
    expect(app.android.versionCode).toBeUndefined();
  });
});

describe("eas.json demo profile", () => {
  it("builds an APK for direct install on Android", () => {
    expect(demo.android.distribution).toBe("internal");
    expect(demo.android.buildType).toBe("apk");
  });

  // An internal (ad hoc) iOS build only installs on registered devices, so guests'
  // iPhones get it through TestFlight.
  it("builds for the store (TestFlight) on iOS", () => {
    expect(demo.ios.distribution).toBe("store");
  });

  it("reads the demo Firebase values from the EAS preview environment", () => {
    expect(demo.environment).toBe("preview");
  });

  // Release builds refuse the in-memory backend, so a missing or wrong value here would
  // ship a build that opens on "This build isn't connected to a backend".
  it("chooses a backend that a release build accepts", () => {
    expect(() => resolveBackend(demo.env.EXPO_PUBLIC_BACKEND, false)).not.toThrow();
  });

  // The Firebase values live in EAS environment variables, never in the repo.
  it("commits no build variable except the backend choice", () => {
    for (const profile of Object.values(eas.build) as { env?: Record<string, string> }[]) {
      const names = Object.keys(profile.env ?? {});
      expect(names.filter((name) => name !== "EXPO_PUBLIC_BACKEND")).toEqual([]);
    }
  });
});
