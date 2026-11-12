# Feast Design System

The single source of truth for how Feast looks. The code version lives in
`src/theme/`; this document explains when to use each part. Read both before changing
any UI, and change both together.

## Brand
- **Name:** Feast. **Tagline:** "Stress Less. Feast More."
- **Source:** Alex's brand boards (`docs/design/brand/palette-board.jpg` and
  `brand-board.jpg`) and the five screen mockups in `docs/design/mockups/`.
- **Character:** warm and food-first. The screens are white with cream (`#FFF2E9`)
  chrome, green actions, and orange and yellow as accents.
- **Light only.** `app.json` sets `userInterfaceStyle: "light"`, because there are no
  dark mockups and no screen handles dark mode. Supporting dark needs a `useTheme()`
  provider and dark roles for every token.

## Palette

| Name | Hex | Status | Notes |
|---|---|---|---|
| Orange | `#E98814` | **Official** (labelled swatch) | RGB 233, 136, 20 |
| Yellow | `#FFE567` | **Official** (labelled swatch) | RGB 255, 229, 103 |
| Green | `#09693F` | **Official** (labelled swatch) | RGB 9, 105, 63 |
| Cream | `#FFF2E9` | Sampled from the boards | To confirm with Alex |
| White | `#FFFFFF` | Neutral | The screen background in the mockups |
| Ink | `#1F1F1F` | Neutral (ours) | Text. Not on the boards |
| Grey | `#5E5E5E` | Neutral (ours) | Muted text and inactive tabs |
| Control grey | `#767676` | Neutral (ours) | Edges of text boxes and chips |
| Line | `#E6DFD9` | Neutral (ours) | Decorative card edges and dividers only |
| Green pressed | `#085936` | Derived (green, 15% darker) | Pressed primary button |
| Orange text | `#A35F0E` | Derived (darkened orange) | Chevrons and small marks that need 3:1 |
| Green tint | `#E3F0E8` | Derived | Selected cells, success messages |
| Yellow tint | `#FFF6C7` | Derived | Info messages |
| Red | `#C62828` | **Off-brand** | Errors and destructive actions only |
| Red dark / tint | `#8E1C1C` / `#FDECEA` | Off-brand | Error message text and background |

The boards also show off-white `#F9F9F7` and near-black `#020202` behind the mono
logos. They are sampled, not labelled as swatches, and the app doesn't use them.

## Semantic roles
Code uses `colors.<role>` from `src/theme` and **never** the swatches (`brand.*`). Only
`src/theme/` itself and `app.json` touch the swatches.

| Role | Value | Use it for | Allowed on | Ratio |
|---|---|---|---|---|
| `background` | white | Screens | — | — |
| `surface` | white | Cards, text boxes | — | — |
| `chrome` | cream | Header, day cards, icon tiles, stats strips | — | — |
| `border` | line | Decorative card edges and dividers | white | 1.32 (decorative) |
| `text` | ink | All normal text | white, cream, tints, orange | 16.48 / 15.01 / ≥14 / 6.28 |
| `textMuted` | grey | Secondary lines, placeholders | white, cream, green tint | 6.48 / 5.91 / 5.53 |
| `action` | green | Primary buttons, links, group headings, selected chips and days, today, active tab | white, cream, green tint | 6.77 / 6.16 / 5.77 |
| `actionPressed` | green pressed | Primary button while pressed | — | — |
| `onAction` | cream | Text and icons on `action` | green, green pressed | 6.16 / 7.67 |
| `selectedTint` | green tint | Selected month cell | — | — |
| `accent` | orange | **Fills and decorative icons only** | — | — |
| `accentText` | orange text | Back chevron, card chevrons | cream, white | 4.55 / 5.00 |
| `highlight` | yellow | Fills, or text and icons **on green only** | green | 5.37 |
| `inputBorder` | control grey | Text box and chip edges (needs 3:1) | white, cream | 4.54 / 4.14 |
| `error` | red | Error text, error borders, the destructive button | white | 5.62 |
| `errorText` / `errorBackground` | red dark / tint | Error message box | — | 7.87 |
| `onDestructive` | white | Destructive button label | red | 5.62 |
| `success` / `successBackground` | green / green tint | Success message box | — | 5.77 |
| `info` / `infoBackground` | orange / yellow tint | Info message box (orange is its edge only; text is ink) | — | 15.12 (ink) |
| `headerBackground` / `headerText` / `headerTint` | cream / ink / orange text | The header bar | — | 15.01 / 4.55 |
| `tabBar` / `tabActive` / `tabInactive` | white / green / grey | The tab bar | white | 6.77 / 6.48 |
| `shadow` | ink | Header and tab bar shadows | — | — |
| `welcomeFallback` / `onWelcome` | orange / ink | Welcome screen where the gradient isn't drawn, and its text | orange | 6.28 |

Also defined:
- `mealTypeColors`: breakfast yellow, lunch orange, dinner green, plus an ink
  `outline`. These are the month-view markers. Each marker is drawn with the ink
  outline (16.48 on white), because yellow and orange alone don't reach 3:1.
- `welcomeGradient`: green into orange, behind the logo on the welcome screen.

`contrastPairs` in `colors.ts` lists every pair the app draws. `contrast.test.ts` fails
if any pair is below 4.5:1 for text or 3:1 for UI graphics.

## Contrast: do and don't

| Pair | Ratio | Verdict |
|---|---|---|
| Green on white / cream | 6.77 / 6.16 | ✅ text |
| Cream on green | 6.16 | ✅ text |
| Yellow on green | 5.37 | ✅ text and icons |
| Ink on cream / orange / yellow | 15.01 / 6.28 / 13.07 | ✅ text |
| **Orange on white / cream** | **2.63 / 2.39** | ❌ not text, not even 3:1 for icons. Use `accentText`. |
| **White or cream text on orange** | **2.63 / 2.39** | ❌ use ink on orange |
| **Green on orange, orange on green** | **2.58** | ❌ |
| **Yellow on white / cream** | **1.26 / 1.15** | ❌ invisible |
| `#999` on white (old placeholder grey) | 2.85 | ❌ replaced by `textMuted` |
| `#ccc` on white (old input border) | ~1.6 | ❌ replaced by `inputBorder` |

Rules:
- Orange is never text and never has light text on it.
- Yellow appears only on green or behind dark text.
- **Brand green is never an "allergen-safe" signal.** "Allergens unknown" must read as
  unknown. Any allergen or diet state needs an icon and text, not colour alone.
- Never show state by colour alone:
  - message tones each have an icon
  - selected chips have a ✓
  - the active tab's label is bold
  - meal slots have icons and labels
  - month markers sit in fixed breakfast, lunch, dinner positions
- Logos are artwork and are exempt from contrast rules. Logo_main's orange tagline on
  green is 2.58:1, which is fine for a logo but not for app text.

## Logos and icons
The originals are 8000×4500 RGBA, in `Brand Assets/` in the Feast Claude project.
**Never bundle the originals** (each one decodes to about 144 MB). The app ships these
exports, cropped to the artwork:

| File in `assets/brand/` | From | Size | Used for |
|---|---|---|---|
| `app-icon.png` | Icon_main on green, opaque | 1024² | `icon` (iOS, and Android before adaptive icons) |
| `adaptive-icon-foreground.png` | Icon_main inside the 66% safe zone | 1024² | Android adaptive foreground (background = green) |
| `adaptive-icon-monochrome.png` | Icon_Black, same placement | 1024² | Android 13+ themed icon |
| `splash-logo.png` | Logo_main on a square, transparent canvas | 1024² | Splash image (background = green) |
| `logo-main.png` | Logo_main | 1200×499 | Welcome screen (`BrandImage variant="wordmark"`) |
| `icon-main.png` | Icon_main | 151×192 | Header mark (`BrandImage variant="mark"`) |
| `favicon.png` | Icon_main on green | 48² | Web favicon |

Usage:
- **The wordmark is artwork. Never type "Feast" in a font as a logo.**
- Logo_main and Icon_main go on green (as on the board), or on cream at small sizes
  (the header mark).
- Not used yet:
  - Logo_variation (yellow F and t): its placement isn't shown on the boards, so ask
    Alex.
  - Icon_variation and Icon_White.
  - Black and white wordmarks exist only on the board JPG. Ask Alex for exports if
    they're needed.
- Show images with `expo-image` at an explicit size, with an `accessibilityLabel`.
  Hide decorative marks from screen readers.

To re-export after Alex sends new artwork, crop to the alpha bounding box. The app
icon is opaque, with the F at about 70% of the height. Adaptive art fits a 676 px
circle on 1024. The splash wordmark is 620 px wide on 1024. Use a Node script with
`jimp-compact` from `node_modules` (not a project dependency) for PNGs, or .NET
`System.Drawing` for large JPGs.

## Typography
- **Font:** the system font (San Francisco on iOS, Roboto on Android) for now. The
  mockups look like a geometric sans (DM Sans or Poppins style), but that's
  unverified, so it's on the open questions list for Alex.
- **Presets** in `src/theme/typography.ts` are size and weight only. Pair them with a
  colour role.

| Preset | Size / weight | Use |
|---|---|---|
| `display` | 28 / 700 | Welcome headline |
| `title` | 20 / 700 | Header bar titles |
| `heading` | 22 / 700 | Main heading on a page |
| `groupHeading` | 18 / 600 | Groups and form sections, shown in green |
| `sectionLabel` | 15 / 700, uppercase | "BREAKFAST", "OCTOBER 2026" |
| `itemTitle` | 16 / 700 | Card and row titles |
| `body` / `bodyStrong` | 16 / 400, 600 | Text |
| `label` | 14 / 600 | Field labels, chips |
| `caption` | 13 | Secondary lines |
| `small` | 12 | Weekday letters, fine print |
| `button` | 16 / 700 | Button labels |
| `tabLabel` / `tabLabelActive` | 12 / 500, 700 | Tab bar |
| `number` | 20 / 700 | Day numbers, the servings stepper |

- Never set `allowFontScaling={false}`. Forms must work at large text sizes.
- **Adding a brand font:**
  1. Bundle the font files (no CDN, so the app starts offline).
  2. Load them with `useFonts` from `expo-font` in `src/app/_layout.tsx`, keeping the
     splash up until they load or fail, and falling back to the system font on error.
  3. Add `fontFamily` to the presets.
  4. Check the licence first.

## Spacing, radii and elevation (`src/theme/layout.ts`)
- **Spacing:** `xxs 2`, `xs 4`, `sm 8`, `md 12`, `lg 16`, `xl 24`, `xxl 32`, `xxxl 48`.
  Screens pad `lg`.
- **Radii:** `sm 8` (small chips), `md 12` (cards, text boxes, buttons), `lg 16`,
  `xl 20` (header and tab bar), `pill`.
- **Sizes:**
  - `MIN_TOUCH_TARGET = 44`. Every control is at least 44pt; use `hitSlop` when the
    visible part is smaller.
  - `CONTROL_HEIGHT = 48` for text boxes and buttons.
  - `CHIP_HEIGHT = 36`, plus hitSlop to 44.
  - `iconSize`: `sm 16`, `md 20`, `lg 24`, `xl 32`.
  - `tileSize`: `md 40` (menu rows, meal cards), `lg 72` (empty states).
  - `DOT_SIZE = 6` (the week strip's "meals planned" dot). `MARKER_SIZE = 8` (month
    markers).
- **Elevation:** only the header and tab bar cast shadows (`shadows.header`,
  `shadows.tabBar`), plus the selected segment (`shadows.raised`). List rows use a
  `border`, never a shadow, to keep scrolling fast.

## Components
All are function components built by composition (no `extends`), in `src/components/`
unless noted.

| Component | Props | Variants and states | Accessibility |
|---|---|---|---|
| `AppHeader` (+ `stackHeader`, `tabHeader`) | `title`, `onBack?`, `right?` | Cream bar with rounded bottom corners. Back chevron only when there's somewhere to go back to. Decorative F mark. Centred title. | Back is a "Back" button. The title is a header. |
| `BrandImage` | `variant: "mark" \| "wordmark"`, `height` (the width follows the artwork) | Mark is decorative. The wordmark is labelled "Feast. Stress Less. Feast More." | Mark is hidden; wordmark is an image with a label |
| `HeaderTextButton` | Pressable props + `label` (works inside `<Link asChild>`) | Green text, 44pt target | button, labelled by `accessibilityLabel` or the label |
| `DecorativeIcon` (+ `IconName`) | Ionicons props | An icon next to text that already says the same thing | Hidden from screen readers |
| `EmptyState` | `icon?`, `title`, `description`, `children?` | Cream icon tile, then title, text and optional action | Title is a header |
| `PlaceholderScreen` | `title`, `description` | Tokens only: no icons, images or fonts, because it's also the startup-error screen | — |
| `form/FormField` + `FieldError` | TextInput props + `label?`, `error?` | White box, `inputBorder`, radius 12, at least 48 tall. Red edge and message on error | Uses the label as `accessibilityLabel` |
| `form/FormMessage` | `tone: error \| info \| success`, `message` | Each tone has an icon and a tinted box | Error is an alert; all are polite live regions |
| `form/SubmitButton` | `label`, `busyLabel?`, `busy?`, `disabled?`, `variant` | primary (green), secondary (white, green edge), destructive (red). Spinner while busy, faded when inactive | button with disabled and busy state |
| `form/ChipSelect` | `options`, `selected`, `onToggle`, `formatLabel?` | `inputBorder` edge. Selected: green with a ✓ | button with selected state |
| `SegmentedControl` | `options`, `value`, `onChange` | Cream track, white selected pill with bold green text | tablist / tab with selected state |
| `TextAction` | `label`, `onPress`, `disabled?`, `tone`, `align?: center \| start`, `accessibilityLabel?` | Green text, or red for destructive | button with disabled state, hitSlop to 44pt |
| `features/account/components/AccountSection` | `title`, `children` | White card with a green group heading | Title is a header |
| `features/account/components/AccountMenuRow` | `icon`, `title`, `caption`, `onPress` | Cream icon tile (decorative orange icon), title, caption, green chevron, divider | button labelled with the title |
| `features/account/components/WithReadyProfile` | `children(user, profile)` | Renders the screen once the profile is ready; otherwise a spinner, "Log in", or "Go to your account" | — |

Feature components follow the same tokens:
- `features/meal-planner/components/WeekStrip`: cream day cards, selected green,
  today outlined.
- `DaySlots`: slot headings, meal cards with a meal-type icon tile.
- `MonthGrid`: outlined markers in fixed positions.
- `features/account/components/SignedOutSection`: the welcome screen.
- `features/recipes/components/RecipeForm`: the recipe form shared by New Recipe and
  Edit Recipe (text boxes, chips, ingredient cards, steps). It takes `initialValues`,
  the button labels and `onSubmit`, and never saves anything itself. On edit, the save
  button stays disabled until something changes.
- Recipe list rows (`recipes/index`): border-only cards with a trailing edit button
  (green pencil, 44pt, labelled "Edit <title>"). Only the button opens the editor;
  tapping the row itself is kept for the detail screen.

## Navigation chrome
- **Header:**
  - `AppHeader` on every stack screen and on the Grocery tab. It has a cream
    background with radius 20 bottom corners and `shadows.header`, an ink `title`, and
    an orange-text back chevron.
  - The mockups' orange chevron is 2.39:1, so it's darkened to `accentText`.
  - The mockups' "•••" menu isn't built (there's nothing behind it).
- **Modals** (Add recipe, Edit meal) keep the native header in the same colours. A
  custom header inside an iOS sheet gets the wrong safe-area spacing.
- **Day sheet** (`formSheet`) has no header, so it draws its own title row in the same
  style.
- **Tab bar:**
  - White, with radius 20 top corners and `shadows.tabBar`.
  - Order: Meal plan, Recipes, Grocery, Account. The app still opens on Recipes.
  - Active is green with a bold label; inactive is grey. Ionicons outlines (calendar,
    book, basket, person).
  - The mockups' Explore tab is the recipe library, which is post-MVP.
- **Scene backgrounds:** `contentStyle` and `sceneStyle` are `background`, so sheets
  and modals don't flash grey.
- **Status bar:** `dark`, on the cream header.
- **Launch:**
  - The splash is green with Logo_main. It's held until startup finishes, at most
    10 s.
  - The root view is white (`expo-system-ui`).
  - Expo Go shows the app icon instead of the splash, so check the splash on a
    preview build.

## Screen map

| Route | Mockup | Status | Plan IDs |
|---|---|---|---|
| `(tabs)/recipes/index` | none (brand defaults) | Done; each row has an edit button | #1, N-01 |
| `(tabs)/recipes/new` | none (brand defaults) | Done | N-01, #5 |
| `(tabs)/recipes/edit/[id]` | none (brand defaults) | Done (same form as new) | N-01 |
| recipe detail | `04-recipe-detail.png` | **Not built** (no route) | N-01, #8 |
| `(tabs)/meal-planner/index` (week) | `02-meal-planner-week-filled.png` | Done, minus photos, swap and expand | #4, #17, N-05 |
| `(tabs)/meal-planner/index` (month) | none (brand defaults) | Done | #4 |
| `(tabs)/meal-planner/day/[date]` | none (brand defaults) | Done | #4, #17 |
| `(tabs)/meal-planner/pick-recipe` | none (brand defaults) | Done | N-05 |
| `(tabs)/meal-planner/entry/[id]` | none (stepper style from 04) | Done | N-05 |
| `(tabs)/grocery-list` | `01-grocery-list-filled.png` | Placeholder: chrome matches, the list isn't built | #6, N-07 to N-11 |
| `(tabs)/account/index` (signed out) | `05-welcome-signed-out.png` | Done, without social login or the photo | N-13, N-14 |
| `(tabs)/account/index` (signed in) | `03-account-signed-in.png` | Done, real rows only | N-15 to N-19, #19 |
| `(tabs)/account/details` | from 03 | Done (profile, security, delete) | N-15, N-17 |
| `(tabs)/account/dietary` | from 03 | Done (allergies and diets) | N-18 |
| `(tabs)/account/log-in`, `sign-up`, `forgot-password`, `choose-username`, `change-password`, `delete-account` | none (brand defaults) | Done | N-13 to N-17 |

"Done" means it follows this system and the mockup within the rules below. N-21 is
ticked only after a person checks the screens on a phone.

## When a mockup and the app disagree
- **Feature doesn't exist:** don't build it and don't fake data. List it below with its
  plan ID.
- **Colour within a few RGB units of a swatch:** use the swatch. Clearly different: use
  the swatch and ask Alex.
- **Fails contrast:** decorative, so match it. Carries information, so use the nearest
  passing token and note it here.
- **Needs a native library or breaks a CLAUDE.md rule:** stop and ask.

### Not implemented (shown in the mockups)

| Item | Mockup | Depends on |
|---|---|---|
| Grocery items, quantities, checkboxes, "+ Add Ingredient" | 01 | #6, N-07 to N-11 |
| Explore tab (recipe library) | all | Later (post-MVP) |
| Recipe photos | 02, 04 | No image field (data model, validation, Rules, storage) |
| Recipe detail screen, "View recipe" | 02, 04 | N-01 |
| Serving scaler (− +) on a recipe | 04 | #8, N-09 |
| Difficulty | 04 | No field in the data model |
| Ingredient swap icons, meal card expand, "Start cooking" | 02, 04 | No feature planned |
| One "Add a meal" button for the whole day | 02 | Needs a slot chooser; each slot keeps its own button |
| Header "•••" menu | all | No feature |
| Saved Recipes, App Settings, Help & Support, Ingredient Preferences rows | 03 | No features |
| Google, Facebook and Apple sign-in | 05 | Not planned; needs native modules and a dev build |
| The welcome screen's food photo | 05 | No licensed photo; a green-to-orange gradient stands in |

### Deviations from the mockups

| Mockup | Ours | Why |
|---|---|---|
| Orange back chevron | `accentText` `#A35F0E` | Orange is 2.39:1 on cream; a control needs 3:1 |
| White text on orange (welcome screen) | Ink | White is 2.63:1; ink is 6.28:1 |
| "Already have account?" | "Already have an account?" | Grammar |
| Big scrolling day cards, week starting Sunday | Seven fitted cards, week starting Monday | The whole week stays visible; the planner's week starts Monday |
| "LOG OUT" in capitals | "Log out" | The label is shared with the log-out flow; screen readers spell out capitals |
| Back chevron on tab root screens | None | There's nowhere to go back to |

## Open questions (for Alex)
1. Is cream `#FFF2E9` official? Are ink `#1F1F1F` and error red `#C62828` acceptable?
2. Which fonts do the mockups use, and what are their licences?
3. Where should Logo_variation and Icon_variation be used? Can we have black and white
   wordmark exports?
4. Meal-slot colours (breakfast yellow, lunch orange, dinner green): OK?
5. Primary button labels: cream (`#FFF2E9`) or pure white?
6. Is a food photo for the welcome screen available, with a licence to use it?

## How to change the design system
1. Change the token in `src/theme/` first (`colors.ts`, `typography.ts`, `layout.ts`,
   `navigation.ts`).
2. **New colour or role:**
   - Add it to `colors.ts` and to the tables in this document.
   - Add every pair it's used in to `contrastPairs`.
   - Say whether it comes from Alex's palette.
3. **Changing a colour `app.json` also uses** (splash, adaptive icon, root background):
   change `app.json` too. `appConfig.test.ts` fails until they match.
4. **New shared component:** only when two or more places use it. Build it by
   composition and add it to the component table.
5. Keep:
   - validation, route-param checks and a11y roles and labels
   - 44pt targets
   - offline start (no CDN fonts or images)
   - virtualised lists
6. Run `npx tsc --noEmit`, `npm run lint` (which rejects colour literals outside
   `src/theme/`) and `npm test`.
7. Update the screen map and the lists above.
