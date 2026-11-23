/// <reference types="node" />
// The social sign-in buttons are placeholders (work in progress): they only show a
// "coming soon" message and never sign anyone in or send anything.
import type { AuthService } from "@/services/auth/AuthService";
import { createInMemoryAuthService } from "@/services/auth/inMemoryAuthService";
import { createInMemoryServer } from "@/services/backend/inMemoryServer";
import { createFakeConnectivity } from "@/testing/fakes/fakeConnectivity";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMING_SOON_HINT,
  comingSoonMessage,
  createSocialPressHandler,
  SOCIAL_PROVIDERS,
  socialButtonLabel,
} from "../socialProviders";

describe("SOCIAL_PROVIDERS", () => {
  it("lists Google, Facebook and Apple, all coming soon", () => {
    expect(SOCIAL_PROVIDERS.map((provider) => [provider.label, provider.status])).toEqual([
      ["Google", "coming_soon"],
      ["Facebook", "coming_soon"],
      ["Apple", "coming_soon"],
    ]);
  });

  it("labels each button and says it's coming soon", () => {
    expect(SOCIAL_PROVIDERS.map(socialButtonLabel)).toEqual([
      "Continue with Google",
      "Continue with Facebook",
      "Continue with Apple",
    ]);
    expect(COMING_SOON_HINT).toBe("Coming soon. Not available yet.");
    expect(comingSoonMessage(SOCIAL_PROVIDERS[0])).toBe(
      "Continue with Google is coming soon. Use Sign up with email for now.",
    );
  });

  it("pressing a button only shows its message and never touches the auth service", () => {
    const auth = createInMemoryAuthService(
      createInMemoryServer({ connectivity: createFakeConnectivity(true).service }),
    );
    const spies = (Object.keys(auth) as (keyof AuthService)[]).map((name) => jest.spyOn(auth, name));
    const show = jest.fn();
    const press = createSocialPressHandler(show);

    for (const provider of SOCIAL_PROVIDERS) press(provider);
    // Pressing again just shows the message again.
    press(SOCIAL_PROVIDERS[2]);

    expect(show.mock.calls.map(([message]) => message)).toEqual([
      "Continue with Google is coming soon. Use Sign up with email for now.",
      "Continue with Facebook is coming soon. Use Sign up with email for now.",
      "Continue with Apple is coming soon. Use Sign up with email for now.",
      "Continue with Apple is coming soon. Use Sign up with email for now.",
    ]);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("imports nothing: no services, no sign-in SDK, no browser", () => {
    const source = readFileSync(join(__dirname, "..", "socialProviders.ts"), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/require\(|expo-auth-session|expo-web-browser|fetch\(/);
  });
});
