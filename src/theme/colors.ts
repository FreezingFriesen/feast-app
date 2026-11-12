// The only place colour values are written (lint enforces it; see docs/DESIGN_SYSTEM.md).
// Screens and components use the semantic roles in `colors`, never the brand swatches.

// Alex's palette. Orange, yellow and green are the labelled swatches on the
// "Colour Palette" board. Cream is sampled from the boards and still to be confirmed.
export const brand = Object.freeze({
  orange: "#E98814",
  yellow: "#FFE567",
  green: "#09693F",
  cream: "#FFF2E9",
});

// Neutrals and derived shades. Not from the brand boards: chosen to pass contrast.
const neutral = Object.freeze({
  white: "#FFFFFF",
  ink: "#1F1F1F",
  grey: "#5E5E5E",
  controlGrey: "#767676",
  line: "#E6DFD9",
  greenPressed: "#085936",
  orangeText: "#A35F0E",
  greenTint: "#E3F0E8",
  yellowTint: "#FFF6C7",
  red: "#C62828",
  redDark: "#8E1C1C",
  redTint: "#FDECEA",
});

// What each colour is for. Pick by role ("the muted text colour"), not by swatch.
export const colors = Object.freeze({
  // Screens are white, as in the mockups. Cream is the brand tint for chrome and tiles.
  background: neutral.white,
  surface: neutral.white,
  chrome: brand.cream,
  // Decorative lines (card edges, dividers). Not for anything that must be seen.
  border: neutral.line,

  text: neutral.ink,
  textMuted: neutral.grey,

  // Buttons, links, selected chips and days, today, the active tab.
  action: brand.green,
  actionPressed: neutral.greenPressed,
  onAction: brand.cream,
  selectedTint: neutral.greenTint,

  // Orange is a fill and illustration colour only: never text, never light text on it.
  accent: brand.orange,
  // Orange-brown that passes on cream and white, for chevrons and other small marks.
  accentText: neutral.orangeText,
  // Yellow only on green, or as a fill behind dark text.
  highlight: brand.yellow,

  // The edge of text boxes, chips and other controls (needs 3:1).
  inputBorder: neutral.controlGrey,

  error: neutral.red,
  errorText: neutral.redDark,
  errorBackground: neutral.redTint,
  onDestructive: neutral.white,
  success: brand.green,
  successBackground: neutral.greenTint,
  info: brand.orange,
  infoBackground: neutral.yellowTint,

  // Navigation chrome.
  headerBackground: brand.cream,
  headerText: neutral.ink,
  headerTint: neutral.orangeText,
  tabBar: neutral.white,
  tabActive: brand.green,
  tabInactive: neutral.grey,

  // Shadows under the header and tab bar.
  shadow: neutral.ink,

  // The welcome screen behind the logo: green into orange, with orange where gradients
  // aren't drawn (web).
  welcomeFallback: brand.orange,
  onWelcome: neutral.ink,
});

// One marker colour per meal slot (month dots). Each is drawn with an ink outline,
// since orange and yellow alone don't stand out from white or cream.
export const mealTypeColors = Object.freeze({
  breakfast: brand.yellow,
  lunch: brand.orange,
  dinner: brand.green,
  outline: neutral.ink,
});

// Green at the top (where the logo sits, as on the brand board) into orange.
export const welcomeGradient = `linear-gradient(180deg, ${brand.green} 0%, ${brand.green} 30%, ${brand.orange} 72%)`;

// "text" pairs need 4.5:1, "ui" pairs (icons, control edges, markers) need 3:1.
export type ContrastPair = {
  use: string;
  foreground: string;
  background: string;
  kind: "text" | "ui";
};

// Every foreground/background pair the app draws. Add a pair here whenever a new
// combination is used; contrast.test.ts checks them all.
export const contrastPairs: readonly ContrastPair[] = Object.freeze([
  { use: "Body text", foreground: colors.text, background: colors.background, kind: "text" },
  { use: "Text on cream chrome (header title, day cards)", foreground: colors.text, background: colors.chrome, kind: "text" },
  { use: "Muted text", foreground: colors.textMuted, background: colors.background, kind: "text" },
  { use: "Muted text on cream", foreground: colors.textMuted, background: colors.chrome, kind: "text" },
  { use: "Muted text on a selected tint", foreground: colors.textMuted, background: colors.selectedTint, kind: "text" },
  { use: "Links, group headings, secondary buttons", foreground: colors.action, background: colors.background, kind: "text" },
  { use: "Header buttons, today's number", foreground: colors.action, background: colors.chrome, kind: "text" },
  { use: "Green icons on cream tiles", foreground: colors.action, background: colors.chrome, kind: "ui" },
  { use: "Primary button label", foreground: colors.onAction, background: colors.action, kind: "text" },
  { use: "Primary button label, pressed", foreground: colors.onAction, background: colors.actionPressed, kind: "text" },
  { use: "Text on a selected tint", foreground: colors.text, background: colors.selectedTint, kind: "text" },
  { use: "Green text on a selected tint", foreground: colors.action, background: colors.selectedTint, kind: "text" },
  { use: "Back chevron on the header", foreground: colors.headerTint, background: colors.headerBackground, kind: "ui" },
  { use: "Chevrons on cards", foreground: colors.accentText, background: colors.surface, kind: "ui" },
  { use: "Text box and chip edges", foreground: colors.inputBorder, background: colors.surface, kind: "ui" },
  { use: "Text box edges on cream", foreground: colors.inputBorder, background: colors.chrome, kind: "ui" },
  { use: "Error text", foreground: colors.error, background: colors.background, kind: "text" },
  { use: "Error message text", foreground: colors.errorText, background: colors.errorBackground, kind: "text" },
  { use: "Error message box edge", foreground: colors.error, background: colors.errorBackground, kind: "ui" },
  { use: "Destructive button label", foreground: colors.onDestructive, background: colors.error, kind: "text" },
  { use: "Destructive button label, pressed", foreground: colors.onDestructive, background: colors.errorText, kind: "text" },
  { use: "Success message text", foreground: colors.success, background: colors.successBackground, kind: "text" },
  { use: "Info message text", foreground: colors.text, background: colors.infoBackground, kind: "text" },
  { use: "Active tab", foreground: colors.tabActive, background: colors.tabBar, kind: "text" },
  { use: "Inactive tab", foreground: colors.tabInactive, background: colors.tabBar, kind: "text" },
  { use: "Meal marker outline", foreground: mealTypeColors.outline, background: colors.background, kind: "ui" },
  { use: "Meal marker outline on a selected day", foreground: mealTypeColors.outline, background: colors.selectedTint, kind: "ui" },
  { use: "Welcome text on orange", foreground: colors.onWelcome, background: brand.orange, kind: "text" },
  { use: "Welcome text on the fallback colour", foreground: colors.onWelcome, background: colors.welcomeFallback, kind: "text" },
]);
