/// <reference types="node" />
// app.json can't import the colour tokens, so these checks keep its colours (splash,
// icon background, the root view) from drifting away from src/theme/colors.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brand, colors } from "../colors";

const REPO_ROOT = join(__dirname, "../../..");
const config = JSON.parse(readFileSync(join(REPO_ROOT, "app.json"), "utf8")).expo;

// The expo-splash-screen plugin entry: ["expo-splash-screen", { ...options }].
function splashOptions() {
  const entry = config.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen");
  return entry?.[1];
}

describe("app.json", () => {
  it("names the app Feast", () => {
    expect(config.name).toBe("Feast");
  });

  it("is light-only, since no screen handles dark mode", () => {
    expect(config.userInterfaceStyle).toBe("light");
  });

  it("paints the root view the screen background, so there's no flash on launch", () => {
    expect(config.backgroundColor).toBe(colors.background);
  });

  it("shows the logo on brand green on the splash screen", () => {
    expect(splashOptions()?.backgroundColor).toBe(brand.green);
    expect(splashOptions()?.image).toBe("./assets/brand/splash-logo.png");
  });

  it("puts the Android adaptive icon on brand green, with no background image to override it", () => {
    const adaptive = config.android.adaptiveIcon;
    expect(adaptive.backgroundColor).toBe(brand.green);
    expect(adaptive.backgroundImage).toBeUndefined();
    expect(adaptive.foregroundImage).toBe("./assets/brand/adaptive-icon-foreground.png");
    expect(adaptive.monochromeImage).toBe("./assets/brand/adaptive-icon-monochrome.png");
  });

  it("uses the brand icon everywhere (no iOS override)", () => {
    expect(config.icon).toBe("./assets/brand/app-icon.png");
    expect(config.ios?.icon).toBeUndefined();
    expect(config.web.favicon).toBe("./assets/brand/favicon.png");
  });
});
