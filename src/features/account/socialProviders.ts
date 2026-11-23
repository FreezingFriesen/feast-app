// The "Continue with Google / Facebook / Apple" buttons on the welcome screen.
//
// Work in progress: not connected to any sign-in provider. These are placeholders for
// the showcase. Social sign-in needs native modules and a development build, and isn't
// planned for the MVP. Nothing here reads or sends anything about the user: pressing a
// button only shows a "coming soon" message. A plain module, so it's tested on its own.

// The only status a provider can have today. Making one work means changing this type
// (and adding a real sign-in flow behind an interface), never just editing the list.
export type SocialProviderStatus = "coming_soon";

export type SocialProvider = {
  id: "google" | "facebook" | "apple";
  // The provider's name, as in "Continue with Google".
  label: string;
  status: SocialProviderStatus;
};

export const SOCIAL_PROVIDERS = [
  { id: "google", label: "Google", status: "coming_soon" },
  { id: "facebook", label: "Facebook", status: "coming_soon" },
  { id: "apple", label: "Apple", status: "coming_soon" },
] as const satisfies readonly SocialProvider[];

// What a screen reader says after the button's label.
export const COMING_SOON_HINT = "Coming soon. Not available yet.";

export function socialButtonLabel(provider: SocialProvider): string {
  return `Continue with ${provider.label}`;
}

export function comingSoonMessage(provider: SocialProvider): string {
  return `Continue with ${provider.label} is coming soon. Use Sign up with email for now.`;
}

// What pressing a button does: show the provider's "coming soon" message. That's all.
export function createSocialPressHandler(show: (message: string) => void) {
  return (provider: SocialProvider) => show(comingSoonMessage(provider));
}
