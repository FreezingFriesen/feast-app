import type { TextStyle } from "react-native";

// Text styles: size and weight only. Pair them with a colour from colors.ts.
// The app uses the system font (San Francisco on iOS, Roboto on Android) until Alex
// confirms the brand fonts. To switch, load the font files with expo-font in
// src/app/_layout.tsx and add a fontFamily to these presets (see docs/DESIGN_SYSTEM.md).
export const typography = Object.freeze({
  // Large headline on the welcome screen.
  display: { fontSize: 28, fontWeight: "700" },
  // Header bar titles.
  title: { fontSize: 20, fontWeight: "700" },
  // The main heading on a page (a recipe name, a day).
  heading: { fontSize: 22, fontWeight: "700" },
  // A group of settings or form sections ("Food Preferences", "Ingredients"). Shown in green.
  groupHeading: { fontSize: 18, fontWeight: "600" },
  // Small capitals heading over a list ("BREAKFAST", "OCTOBER 2026").
  sectionLabel: { fontSize: 15, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  // A card or row title.
  itemTitle: { fontSize: 16, fontWeight: "700" },
  body: { fontSize: 16 },
  bodyStrong: { fontSize: 16, fontWeight: "600" },
  // Field labels and chip text.
  label: { fontSize: 14, fontWeight: "600" },
  // Secondary lines under a title ("4 servings", "Manage").
  caption: { fontSize: 13 },
  // Day-of-week letters and other small print.
  small: { fontSize: 12 },
  button: { fontSize: 16, fontWeight: "700" },
  tabLabel: { fontSize: 12, fontWeight: "500" },
  tabLabelActive: { fontSize: 12, fontWeight: "700" },
  // Big numbers (the day in the week strip, the servings stepper).
  number: { fontSize: 20, fontWeight: "700" },
  // Arrow and close glyphs drawn as text.
  glyph: { fontSize: 22 },
} satisfies Record<string, TextStyle>);
