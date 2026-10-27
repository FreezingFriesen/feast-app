# Project Plan

Live document. Update it as decisions change and tick boxes as features are done.

## Overview
- **What:** Mobile app to store recipes, plan meals for the week, and generate
  grocery lists with estimated cost and nutrition.
- **Now:** Capstone prototype (PROJ 309), built by a team of 5.
- **Later:** One maintainer releases it as a paid app (monthly/yearly/lifetime
  subscription, 7-day free trial, no free version). Team members will sign IP
  releases.
- **Stack:** Expo (React Native), Firebase (Auth, Firestore, Security Rules,
  Cloud Functions). Prototype runs in **Expo Go**; move to a development build
  after the capstone.
- **Methodology:** Waterfall planning, then Scrumban execution. Teams for chat
  and task assignment. Daily: check Teams. Weekly: in-class scrum. Monthly:
  review/feedback session.

## Timeline
| Sprint | Length | Notes |
|---|---|---|
| 1 | 1 week | Foundations. No story needs to be fully complete. |
| 2 | 4 weeks | Not yet planned |
| 3 | 4 weeks | Not yet planned |

Each sprint also needs: updated documentation, a sprint progress report, and a
solution showcase.

## MVP features
IDs: `#n` = user story from the product backlog. `N-nn` = feature added during
planning (no backlog ID yet).

### Recipes
- [ ] #1 Store recipes on the device
- [ ] N-01 Create, view, edit and delete recipes manually (each edit sets `updatedAt`)
- [ ] #8 Adjust serving size; ingredient amounts scale to match
- [ ] #5 Tag recipes by diet (e.g. keto)
- [ ] Tag recipes by Breakfast, Lunch, Dinner (For the mealplanner to search from, recipes can be tagged under multiple)
- [ ] #10 Sort/filter recipes by food restriction or allergy
- [ ] N-02 Search stored recipes by name
- [ ] N-03 Filter stored recipes by ingredients, diet, allergies, and high/low protein, fiber, etc.
- [ ] N-04 Filter by the user's profile restrictions **by default**, with a toggle to turn it off and a clear indicator while it is off

### Meal planning
- [ ] #4 Weekly meal planner
- [ ] #17 Breakfast, Lunch and Dinner slots for each day
- [ ] N-05 Assign recipes to slots; move or remove them
- [ ] N-06 Estimated cost shown for the meal plan

Status: Month/Week planner UI, assign/move/remove and servings are built
(#4, #17, N-05). Entries are stored in memory until #1 (SQLite) lands.
N-06 is waiting on ingredient price data.

### Grocery lists
- [ ] #6 Generate a weekly grocery list from the meal plan
- [ ] #18 Grocery list usable offline
- [ ] N-07 Merge duplicate ingredients across recipes
- [ ] N-08 Combine units (cups vs grams) using ingredient density data
- [ ] N-09 Scale quantities from serving-size changes (#8)
- [ ] N-10 Check off items and add manual items
- [ ] N-11 Estimated cost shown on the grocery list

### Nutrition
- [ ] #3 Track nutrition / calorie intake
- [ ] N-12 Estimated nutrition values for ingredients and meals
  - Bundled static dataset, refreshed from the nutrition API (via server-side sync into Firestore) when online, cached on device for offline use
  - All API responses are validated before being stored

### Accounts and sync
- [ ] N-13 Sign up with email, unique username, and password
- [ ] N-14 Log in with email and password (requires being online)
- [ ] N-15 30-day sessions; session tokens in secure storage
- [ ] N-16 Password reset via email
- [ ] N-17 Delete account
- [ ] N-18 Add dietary restrictions (allergies, diets) to account info
- [ ] #19 Store recipes and app data on the account; restore on a new device
- [ ] N-19 Local-first sync: changes saved on device, synced to Firebase on reconnect, last edit wins

Status: The Firebase project isn't available yet, so the Account tab is built
against an in-memory backend behind the same interfaces. Done so far: validation,
interfaces, domain errors, the 30-day session, chunked secure token storage, the
in-memory auth and username backend with a shared contract test suite, the SQLite
profile cache and the composition root. Built against the in-memory backend:
- signed-out screens: log in, sign up, forgot password, choose username
- signed-in page: profile, dietary restrictions, sync status, session info,
  change password, log out
- delete account: re-authenticate, typed username, retry-safe deletion

Nothing is ticked until it works against Firebase. N-18 is local only until sync
exists. Account tab phases:
3. signed-out UI (done)
4. signed-in UI (done)
5. delete account (done)
6. Firebase, Security Rules and rules tests (blocked until the database exists)

### Offline
- [ ] N-20 Stored recipes, meal planning and grocery list generation all work fully offline

## Later (post-MVP)
- Recipe import from outside the app: social media, email, photos of physical
  recipes (was #12). Imported content is untrusted and must be validated.
- Subscriptions: paid app with 7-day free trial. Status checked **server-side and
  in the app** (server is authoritative). Needs a development build.
- Recipe library: large built-in recipe database users can pick from and search.
  Kept in a separate collection from user recipes. A dedicated search service
  will be added when this starts (Firestore has no full-text search). Check
  recipe licensing/copyright.

## Technical decisions
- **Local-first storage.** Data lives in a local database on the device
  (e.g. `expo-sqlite`, works in Expo Go). Firebase is the sync and backup layer.
  The Firestore JS SDK's offline cache has historically not worked on React
  Native, so we do not rely on it. (Jasneet to re-verify in Sprint 1.)
- **Repository interfaces** wrap storage and Firebase so the SDK can be swapped
  after the capstone without touching screens.
- **Conflicts:** last edit wins via `updatedAt`. Use soft deletes (`deletedAt`).
  Client clocks can be wrong, so Security Rules should reject timestamps far in
  the future, and `updatedAt` may be set from the server on sync.
- **Sessions:** 30 days, enforced by storing the login date and signing out after
  30 days. Token in `expo-secure-store`. Firebase Auth persistence must be set up
  explicitly on React Native. SecureStore rejects ":" in keys and may reject values
  over about 2 KB, and Firebase's session has both, so it is stored through our
  chunked adapter (`src/services/session/chunkedSecureStorage.ts`), never AsyncStorage.
- **Allergens:** Health Canada's 11 priority allergens (`ALLERGENS` in
  `src/validation/recipeSchema.ts`), shared by recipes, profiles and the
  ingredient data.
- **Profile cache:** `expo-sqlite`, in place before the signed-in Account UI.
- **Connectivity:** `expo-network` (in Expo Go) behind `ConnectivityService`.
  Network errors from Firebase are also treated as offline.
- **Backend choice:** `EXPO_PUBLIC_BACKEND` = `memory` (default) or `firebase`, read
  only in `src/services/AppProviders.tsx`. Implementations are picked only in
  `src/services/createAppServices.ts`. The in-memory backend is a development fake
  that forgets everything on reload. Production builds refuse it, and unknown values
  are refused. `firebase` is a stub that fails with `backend_not_configured` until
  Phase 6.
- **Domain errors:** expected failures are typed results. Anything an implementation
  throws is a `DomainError` (`src/services/domainErrors.ts`): a plain `Error` with a
  `code`, not a subclass. Screens never see Firebase error codes.
- **Local database:** `expo-sqlite` (`feast.db`). The schema lives in
  `src/storage/migrations.ts` as numbered, constant SQL migrations. Version 1 is
  `profiles`; recipes and meal plans (#1) add version 2 onwards.
- **Login by email**; username is a unique display name stored in a `usernames`
  collection.
- **Nutrition/price data:** API key stays server-side. A script or Cloud Function
  pulls from the API, validates, and writes to Firestore. The app only reads
  Firestore and caches it.
- **Dev build later:** after the capstone, switch to React Native Firebase and an
  EAS development build; add payments.

## Data model (draft)
```
users/{uid}
  email, username, dietaryRestrictions[] (allergies, diets), createdAt

usernames/{usernameLowercase}      // doc id enforces uniqueness
  uid

users/{uid}/recipes/{recipeId}
  title, servings
  ingredients[]: { ingredientId, name, quantity (number), unit (enum), note?, rawText? }
  steps[]
  dietTags[], allergens[]          // allergens computed from ingredients
  source?: { type: "url"|"social"|"email"|"photo"|"manual", name?, url?, importedAt? }
  createdAt, updatedAt, deletedAt?
  schemaVersion

users/{uid}/mealPlanEntries/{entryId}  // one recipe in one slot; recipe ID + servings, never a copy
  date ("YYYY-MM-DD", 2000-01-01 to 2100-12-31)
  mealType (breakfast | lunch | dinner)
  recipeId (^[a-z0-9_-]{1,100}$), servings (int 1-100)
  createdAt, updatedAt, deletedAt?
  schemaVersion
  // One doc per entry so last-edit-wins works per entry, not per week.
  // Max 10 live entries per date + mealType (repository check).
  // Limits live in src/validation/mealPlanSchema.ts; mirror them in Security Rules.
ingredients/{ingredientId}         // shared reference data
  name, pricePerUnit, nutritionPer100g, densityGramsPerCup, dietTags[], allergens[]

libraryRecipes/{recipeId}          // LATER; separate from user recipes
```
Grocery lists, meal plan cost and nutrition totals are **derived**, not stored.

## Sprint 1 (1 week)
**Goals**
1. Basic app framework with the major pages initialized
2. Database decision: Firebase (structure designed this sprint)
3. Initial visual identity (logo, general visual direction)
4. Basic UI/UX of the major pages (recipes, meal planning, grocery list): scroll,
   navigate between pages, manually create a basic recipe

**Stories touched** (none expected to be complete): #1, #4, #18

**Who**
- Levi & Zane: coding and UI (Expo setup, major pages, navigation, basic recipe creation)
- Alex: finalize logo and general visual direction
- Edwin: pricing data and a list of common ingredients (include nutrition,
  density, diet/allergen tags where possible)
- Jasneet: structure the Firebase database; confirm offline behavior in Expo Go

**Tasks**
- [ ] Create GitHub repo, add all team members
- [ ] Initialize Expo app and major pages
- [ ] Agree the ingredient data format (Jasneet, Edwin, Levi, Zane)
- [ ] Design Firestore structure and draft Security Rules
- [ ] Logo and visual direction approved by the team
- [ ] Basic navigation and scrolling on all major pages
- [ ] Very basic manual recipe creation

## Sprint 2 (4 weeks)
To be planned.

## Sprint 3 (4 weeks)
To be planned.

## Open items
- Choose the nutrition API and confirm its terms.
- Define the ingredient data format (feeds cost, nutrition, unit conversion,
  diet/allergen tags and filters).
- Decide whether local data is wiped on logout (shared devices).
- Account defaults to confirm, all in `src/services/account/accountDecisions.ts`:
  log out wipes local data after confirmation; session expiry signs out but keeps
  local data; email verification is shown but doesn't block use; username change
  only in the optional last phase.
  - Until sync exists, wiping on log out deletes recipes and meal plans for good,
    because they aren't backed up anywhere. Consider switching the wipe off until
    sync lands.
- The Account page says recipes are filtered by dietary restrictions by default
  (N-04), but that filter isn't built yet.
- Re-authenticating (e.g. to change password) doesn't restart the 30-day session
  on the device. The planned server-side `auth_time` check would restart it, so
  the device is stricter. Decide whether re-authentication should count as a new
  login.
- Data model for `users/{uid}`: store `dietaryRestrictions` as
  `{ allergens[], diets[] } | null` (null = not set yet, empty lists = none), and
  don't store `email` there (Firebase Auth holds it; a copy goes stale).
- Firebase user IDs contain capitals, so they don't match the CLAUDE.md ID rule.
  They use `UID_PATTERN` (`^[A-Za-z0-9]{1,128}$`) instead.
- The live username check runs before sign-in, so `usernames/{name}` needs `get`
  (not `list`) for signed-out users, which reveals the uid behind a username. The
  alternative is a Cloud Function.
- Cloud Functions need the Blaze (paid) plan. Account deletion (N-17) runs from the
  app for the capstone (`src/services/account/AccountDeleter.ts`). Order:
  1. re-authenticate
  2. the user's synced content
  3. release the username
  4. the `users/{uid}` profile (after the username, so a retry can still find the name)
  5. the auth account
  6. wipe the phone

  Every step is safe to repeat, so a failed deletion is simply run again. When the
  project moves to Blaze, add a server-side cleanup (an auth `onDelete` trigger or
  the "Delete User Data" extension) so data is removed even if the app is closed
  part way through.
- Deleting an account is only offered once it has a username. An account whose
  sign up stopped half way has to choose a username first.
- Should Recipes, Meal Planner and Grocery List require being signed in? Today an
  expired session doesn't block them.
- When the Firebase project is connected (Account Phase 6), check:
  1. Auth persistence uses `getReactNativePersistence(sessionStore.authStorage)`, not
     AsyncStorage (`src/services/firebase/client.ts`); the session survives a restart;
     an iOS reinstall doesn't bring back an old session.
  2. The real SecureStore token size on iOS and Android fits the chunked storage, and
     sign-out removes every `feast.session.auth.*` key.
  3. Security Rules for `users/{uid}` and `usernames/{name}` mirror the schema limits
     (Zod counts code points), with emulator tests. The emulator runs here with a
     `demo-` project ID.
  4. Account deletion removes the subcollections (batches of 500 or fewer), releases
     the username, deletes `users/{uid}`, then deletes the auth user, and a retry after
     a failure at any step finishes. Check in the console that nothing is left.
  5. Restore on a new device downloads and validates the profile and data.
  6. The shared contract suite (`src/testing/contracts/`) passes against the emulators.
- Plan Sprints 2 and 3; confirm how the rubric's hours-per-person applies to a
  one-week Sprint 1.
- Stakeholder communication plan for Sprint 1 (missing from the plan template).
- Decide which phones the team tests on (iOS, Android, or both).
- Upgrade to Expo SDK 58. It fixes the `decode-uri-component` advisory in
  expo-router's deep-link parsing (moderate DoS, ships in the app). Everyone on
  the team needs an Expo Go that supports SDK 58.
- Known `npm audit` advisories with no upstream fix yet, dev tooling only (not in
  the app): `braces` (Metro/Jest), `node-forge` (Expo CLI) and the copy of `zod`
  nested inside `@expo/cli`. The app's own `zod` is ^4.6.7, which has the
  memory-exhaustion fix (GHSA-mrhx-c7xc-m3w5). Re-check with
  `npm audit` each sprint. Never run `npm audit fix --force` (it downgrades Expo
  and Firebase).
- `package.json` `overrides` force `@grpc/grpc-js` ^1.13.6 (Firestore still pins
  ~1.9) and `js-yaml` ^4.1.1 under `@istanbuljs/load-nyc-config`. Remove each
  override once the upstream package updates its own dependency.
