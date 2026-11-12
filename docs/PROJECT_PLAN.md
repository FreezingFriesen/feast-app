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
- [x] #1 Store recipes on the device
- [ ] N-01 Create, view, edit and delete recipes manually (each edit sets `updatedAt`)
- [ ] #8 Adjust serving size; ingredient amounts scale to match
- [ ] #5 Tag recipes by diet (e.g. keto)
- [ ] Tag recipes by Breakfast, Lunch, Dinner (For the mealplanner to search from, recipes can be tagged under multiple)
- [ ] #10 Sort/filter recipes by food restriction or allergy
- [ ] N-02 Search stored recipes by name
- [ ] N-03 Filter stored recipes by ingredients, diet, allergies, and high/low protein, fiber, etc.
- [ ] N-04 Filter by the user's profile restrictions **by default**, with a toggle to turn it off and a clear indicator while it is off

Status: recipes are stored in SQLite and survive a restart (#1). Editing is built
(N-01): each row in the recipe list has an edit button that opens `recipes/edit/[id]`.
It uses the same `RecipeForm` as New Recipe and saves through `RecipeRepository.update`
(on the phone first, synced later). An ingredient's `ingredientId` and `note`, which the
form doesn't show, are kept, and the `ingredientId` is dropped if the ingredient is
renamed, so it reads as unmatched. Still to do for N-01: the recipe detail screen and
delete (`remove`, a soft delete, is in the repository but no screen uses it). Leaving
the edit screen doesn't ask before discarding changes (needs Expo SDK 58, see Open items).

### Meal planning
- [ ] #4 Weekly meal planner
- [ ] #17 Breakfast, Lunch and Dinner slots for each day
- [ ] N-05 Assign recipes to slots; move or remove them
- [ ] N-06 Estimated cost shown for the meal plan

Status: Month/Week planner UI, assign/move/remove and servings are built
(#4, #17, N-05). Entries are stored in SQLite and survive a restart (#1).
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

Status: The Account tab runs on either backend, chosen by `EXPO_PUBLIC_BACKEND`:
the in-memory fake (the default) or real Firebase Auth and Firestore. Done so far:
validation, interfaces, domain errors, the 30-day session, chunked secure token
storage, the SQLite profile cache and the composition root, plus:
- signed-out screens: log in, sign up, forgot password, choose username
- signed-in page: a menu with Account Details (profile, session info, change
  password, delete account) and Allergies & Diets (dietary restrictions), plus the
  sync status card and log out
- delete account: re-authenticate, typed username, retry-safe deletion
- Firebase services, proven on the emulators by the same contract suite as the fake
  (`npm run test:backend`)

Sync (N-19, #19) is built: `createSyncService` in `src/services/sync/` replaces the stub.
It runs in the foreground when a user is signed in and online: at app start, after
sign in, when the connection comes back, 3 s after local changes, and on "Sync now".
Each run downloads recipes and meal plan entries (server reads only, paged), merges
them (last edit wins; a delete always wins), then uploads what changed on the phone.
A new phone restores everything with progress on the Account page. Recipes and meal
plans are proven on the in-memory backend and the emulators (`npm test`,
`npm run test:backend`); the real project checks are still to do. The profile
(dietary restrictions, N-18) still syncs only at sign up and sign in.

Nothing is ticked until a person confirms it on the real Firebase project (see "When
the Firebase project is connected" in Open items). Account tab phases:
3. signed-out UI (done)
4. signed-in UI (done)
5. delete account (done)
6. Firebase, Security Rules and rules tests (built and passing on the emulators; the
   checks on the real project are still to do)

### Offline
- [ ] N-20 Stored recipes, meal planning and grocery list generation all work fully offline

### UI / visual identity
- [ ] N-21 Apply the Feast brand UI to every screen (proposed ID, no backlog story yet)

Status: the design system is in `src/theme/` and `docs/DESIGN_SYSTEM.md`, and every
existing screen follows it and the mockups in `docs/design/mockups/`. Not ticked until
a person checks it on a phone (the header, sheets, modals, keyboard, large text and the
welcome gradient), and the splash and app icon on a preview build, since Expo Go doesn't
show them.

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
  are refused. `firebase` needs the six Firebase values in `.env.local` (see
  `.env.example`), or startup fails with `backend_not_configured`. With `memory`, the
  Firebase SDK never runs and nothing reads those values.
- **Firestore with no connection:** the SDK queues writes, and their promises stay
  pending forever, and list reads answer "empty" from its cache. So the services read
  from the server only, and every call checks the connection first and gives up after
  15 seconds, reporting `offline` (`src/services/firebase/firestoreCalls.ts`). Firestore's
  own offline storage stays off: SQLite is our local store. Claiming a username is a
  transaction, not a queued write: it goes straight to the server, and the SDK retries it
  at most 5 times.
- **Guardrails:** lint refuses the Firebase SDK outside `src/services/firebase/`, the
  five `firebase*.ts` services, `src/testing/` and `firestore-tests/`, and `firebase-admin`
  outside `scripts/`. A test fails if an `EXPO_PUBLIC_` name appears beyond the seven
  in `.env.example`.
- **Domain errors:** expected failures are typed results. Anything an implementation
  throws is a `DomainError` (`src/services/domainErrors.ts`): a plain `Error` with a
  `code`, not a subclass. Screens never see Firebase error codes.
- **Local database:** `expo-sqlite` (`feast.db`). The schema lives in
  `src/storage/migrations.ts` as numbered, constant SQL migrations: 1 `profiles`,
  2 `recipes`, 3 `meal_plan_entries` (#1), 4 `sync_meta` (N-19). Lists are stored as JSON text, length-capped
  before parsing, and every row read back is validated with the stored-record schemas
  (`storedRecipeSchema`, `storedMealPlanEntrySchema`); a row that fails reads as missing.
  The same repositories are used with both backends.
- **Sync hooks:** recipes and meal plan entries have a `dirty` column
  (1 = changed on this phone and not uploaded). Both repositories add `Syncable`
  (`src/repositories/Syncable.ts`): `listPending(limit, after?)` (dirty records, deleted
  ones included, oldest edit first, with a cursor so refused records never block the
  rest, as `{ id, data }` where `data` is exactly the Firestore document), `pendingCount`,
  `markSynced(id, updatedAt)` (only if `updatedAt` still matches, so an edit made during
  an upload is uploaded next time) and `mergeIncoming`. Merging: **a delete always
  wins** (a deleted copy replaces a live one however old it is, and a deleted record is
  never brought back, matching the Rules, which never let a deleted document go live
  again); otherwise last edit wins and a tie keeps the local copy. Edits never move
  `updatedAt` backwards, and SQLite edits are written only if the row is still the one
  that was read, so a download landing mid-edit isn't lost.
- **Sync engine (N-19, #19):** `src/services/sync/createSyncService.ts` (status, triggers,
  one run at a time) and `syncRun.ts` (one run). The server side is behind
  `RemoteContentStore` (`src/services/userData/`): Firebase and in-memory, both held to
  the same contract suite, which also runs on the emulators against the real Rules.
  - Download before upload (the Rules refuse an upload over a newer server copy).
    Downloads read from the server only, ordered by `updatedAt` then document ID, 500 a
    page, continuing with a cursor, so hundreds of records with the same `updatedAt`
    can't loop. Every document is validated by `mergeIncoming`; bad ones are skipped
    and counted.
  - The high-water mark is the newest `updatedAt` the server returned (never the phone's
    clock), saved after each page. Each download starts **1 hour before it**
    (`DOWNLOAD_OVERLAP_MS`), because `updatedAt` comes from phone clocks and a phone whose
    clock is behind can upload changes that look older than ones already downloaded.
  - Uploads are re-validated, built from the key lists in `remoteDocuments.ts` (copied
    from `firestore.rules`: no `id`, no local fields, no `undefined`), and written 100 at
    a time. A batch the Rules refuse is retried one record at a time, so one refused
    record fails alone; it stays pending and is reported ("N changes couldn't be synced").
  - `sync_meta` holds the owner uid, both high-water marks and the last sync time. Data
    made while signed out belongs to nobody and the first user to sign in adopts it.
    Another account's data is never merged or uploaded ("This phone has another account's
    data"). The log out wipe clears `sync_meta` too.
  - `stop()` cancels the run in progress, waits for it, and pauses sync until a
    different user signs in. Log out calls it before signing out; account deletion calls
    it right before deleting the content. Every write a run makes (local or remote) first
    checks that the user and run are still current. `deleteAll` first waits for writes
    the SDK still has queued.
  - Log out runs a best-effort sync (at most 10 s) before the prompt, which then says how
    many changes aren't backed up.
- **Web build:** `web.output` is `single` in `app.json`, not `static`. With `static`,
  the SDK 57 dev server fails with "Worker chunk not found" because it can't bundle
  expo-sqlite's web worker. `metro.config.js` adds `.wasm` as an asset type for the
  same worker. Try `static` again after an Expo upgrade if static web pages are ever
  needed.
- **Theme (N-21):** the design system lives in `src/theme/` (colour roles, contrast,
  typography, layout, navigation options) and is explained in `docs/DESIGN_SYSTEM.md`.
  - Colour literals outside `src/theme/` fail lint (`no-restricted-syntax` in
    `eslint.config.js`).
  - `contrast.test.ts` checks every colour pair the app draws; `appConfig.test.ts`
    keeps `app.json`'s colours equal to the tokens.
  - **Light only** (`userInterfaceStyle: "light"`): no mockup is dark and nothing
    handles dark mode.
  - White screens with cream chrome, as in the mockups, and the system font until Alex
    confirms the brand fonts.
  - Headers are our own `AppHeader` (rounded cream bar), except the two modals, which
    keep the native header.
- **Login by email**; username is a unique display name stored in a `usernames`
  collection.
- **Nutrition/price data:** API key stays server-side. A script or Cloud Function
  pulls from the API, validates, and writes to Firestore. The app only reads
  Firestore and caches it.
- **Ingredient import:** `npm run import:ingredients -- <file.csv> --dry-run` checks a
  CSV with no credentials or network. `--write` does the import, and refuses a key inside
  the repo. The script never opens the key: the Firebase admin library reads it from
  `GOOGLE_APPLICATION_CREDENTIALS`. Exactly three known spellings are corrected first
  (`lbs`, `tree nuts`, `peanut`), and each fix is printed; `ingredientSchema` stays strict
  and rejects them if given them directly. Columns the schema doesn't have are named and
  ignored. A missing `allergens_reviewed` column means false.
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
- Edwin's CSV (`ingredients list v5.csv`) dry-runs to 199 valid and 1 skipped. Still to do:
  - Fix the id on line 140 (`roll_dinner_+A148+A140`).
  - Decide whether the `Substitutes` column becomes a field. Today it's ignored, and
    adding it is a data model change.
  - Every row has `allergens_reviewed` false, because the column isn't in the file, so
    the app must show "allergens unknown" until someone reviews them.
  - Nobody has run the real import yet. It needs the real project and a key kept outside
    the repo, and the app doesn't read ingredients yet.
- Decide whether local data is wiped on logout (shared devices).
- Account defaults to confirm, all in `src/services/account/accountDecisions.ts`:
  log out wipes local data after confirmation; session expiry signs out but keeps
  local data; email verification is shown but doesn't block use; username change
  only in the optional last phase.
  - Wiping on log out deletes changes that haven't synced (refused ones, or anything
    made offline). Log out syncs first when it can, and the prompt says how many will be
    lost.
- Local recipes and meal plans aren't tied to an account by a column (no `uid`); sync
  records the owner in `sync_meta` instead. If a second account signs in without the wipe
  (e.g. after a session expiry), it still sees the first account's data on the phone,
  but nothing syncs until log out clears it.
- Known limits of sync (N-19):
  - A phone clock more than 5 minutes fast makes records the Rules refuse. They upload
    once real time catches up (and are reported until then). A phone clock more than
    1 hour slow can make changes other phones never download (past the overlap window).
  - A tie (two phones editing the same record in the same millisecond) leaves each phone
    with its own copy.
  - Tombstones (deleted records) stay on the server and phones forever; nothing removes
    them yet.
  - The `memory` backend makes a new uid on every reload, so after a reload its local
    recipes read as "another account's data" until log out.
  - Log out can wait for one network call (at most 15 s) if a sync is in the middle of one.
  - After an account deletion that fails part way, sync stays paused until the user signs
    in again or restarts the app.
  - Restore progress is shown on the Account page only; other screens fill in as records
    arrive.
  - `mergeIncoming` for meal plans doesn't apply the 10-entries-per-slot limit (the
    server doesn't either; refusing a download would leave phones with different plans),
    so a slot can end up with more than 10. Its entries can still be edited, but nothing
    more can be added or moved in.
  - A pending row that fails validation (a corrupted or tampered database) is never
    uploaded and stays pending, so `pendingCount` never reaches 0 while it is there.
  - Removing a recipe doesn't remove the meal plan entries that use it. They show as
    "Recipe unavailable" and can still be removed. A download can also bring an entry
    before its recipe, which looks the same until the recipe arrives.
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
- When the Firebase project is connected (Account Phase 6), a person must check these
  on a real phone and the real project. The emulator tests can't show them. Set
  `EXPO_PUBLIC_BACKEND=firebase` and the six Firebase values in `.env.local`.
  1. **Sessions:** log in, restart the app, and you're still logged in. If you're logged
     out on every launch, Firebase couldn't use the secure storage. On iOS, an uninstall
     and reinstall may bring back the old session, because keychain data can survive
     (no install marker is built yet).
  2. **SecureStore token size:** the real session fits the chunked storage on iOS and
     Android, with no size warnings, and logging out removes every
     `feast.session.auth.*` key.
  3. **Deployed rules:** deploy `firestore.rules` (a person does this, not a script), then
     re-check on the live rules that a 500-emoji description is accepted and 501 is
     refused. Zod counts code points; in the emulator, Rules `size()` counts UTF-16 units
     (an emoji is 2), so text lengths use a regex (`validText`).
  4. **Account deletion:** on the real project, deleting an account leaves nothing in the
     console (`users`, `usernames`, `recipes`, `mealPlanEntries`, the Auth user), and the
     email and username can be used again. The real project enforces "recent login"; the
     emulators don't.
  5. **Restore on a new device:** log in on a second phone: the profile, recipes and meal
     plans all download, with "Restoring your data… N of M" on the Account page. Edit on
     each phone and check the other gets it after "Sync now".
  6. **Real behaviour the emulators can't show:** turn on email enumeration protection
     and a minimum-8 password policy in the console, then check that a wrong password and
     an unknown email give the same message, password reset gives the same answer, the
     reset and verification emails arrive, and too many wrong passwords shows the
     rate-limit message.
  7. **Sync offline:** in airplane mode, add and edit recipes and meal plans: everything
     works, and the Account page shows "Offline" with the number of changes waiting.
     Turn airplane mode off: they upload by themselves and the count drops to 0.
  8. **Synced documents in the console:** under `users/{uid}/recipes` and
     `mealPlanEntries`, each document has only the allowed fields (no `id`, no `dirty`),
     and a deleted recipe is still there with `deletedAt` (a tombstone).
  9. **Download query:** the first sync on the real project runs without a "needs an
     index" error (it orders by `updatedAt` and the document ID).

  Already passing on the emulators, no need to repeat: every rule path
  (`npm run test:rules`), and the contract suites plus the two-accounts race, full
  deletion with a retry after a failure at each step, 1,200-recipe delete, and sync:
  restore on a second phone, edits both ways, a delete, 1,200-record restore and a
  refused future timestamp (`npm run test:backend`).
- Known limits of the Firebase services:
  - A phone clock more than 5 minutes fast can't claim a username. The rules refuse the
    future timestamp. The app then checks who holds the name: "name taken" only if another
    user does, otherwise a general error.
  - A claim that timed out isn't queued, but the SDK may still be retrying it for a few
    seconds, so it can still land. The user may get the name after all, and the next
    profile refresh picks that up. If the connection drops after the claim reached the
    server, the retry sees the user's own claim and reports "name taken"; the profile
    refresh corrects that too.
  - Email-verified status only updates on the next sign-in. `AuthService` has no reload.
  - The planned 30-day `auth_time` check isn't in the rules, so sessions are limited on
    the phone only.
  - Skipped on the emulators, run in memory only (no fake clock or forced failures there):
    the nine contract tests listed in `src/testing/contracts/firebaseHarness.ts`.
- Security Rules can't check the items inside a list (no loops), so for recipes they
  check only each list's type and size. Not checked on the server: each ingredient
  row (keys, name, quantity, unit, note, ingredientId), each step's length, `cleanText`
  on free text (NFC, control and invisible characters, trim), and the 10-entries-per-slot
  meal plan limit. A modified app could store a bad ingredient row or step, but only
  in its own account, and every device validates downloads before using them. The
  full list is at the top of `firestore.rules`. A Cloud Function (Blaze plan) could
  check them on the server later. No data model change is planned for this.
- The recipe Rules accept an optional `allergens` list (the data model computes it from
  the ingredients), but `recipeSchema` doesn't produce it yet, and `storedRecipeSchema`
  drops it from downloads. Add it to both when the allergen computation is built. `source` in the data model isn't in `recipeSchema`
  either, so the Rules refuse it until recipe import is built (the ingredient row's
  `rawText` isn't in `ingredientRowSchema`, and rows aren't checked by the Rules).
- Design questions for Alex (N-21; the full list is in `docs/DESIGN_SYSTEM.md`):
  - Is cream `#FFF2E9` official? Are ink `#1F1F1F` and error red `#C62828` OK?
  - Which fonts do the mockups use, and what are their licences?
  - Where do Logo_variation and Icon_variation go? Can we have black and white
    wordmark exports?
  - The meal-slot colours.
  - Button label cream or white.
  - A licensed photo for the welcome screen.
- The mockups show things with no feature behind them yet (recipe photos, a recipe
  detail screen, difficulty, ingredient swaps, social login, Explore). They're listed
  under "Not implemented" in `docs/DESIGN_SYSTEM.md`. Recipe photos and difficulty
  would be data model changes.
- Plan Sprints 2 and 3; confirm how the rubric's hours-per-person applies to a
  one-week Sprint 1.
- Stakeholder communication plan for Sprint 1 (missing from the plan template).
- Decide which phones the team tests on (iOS, Android, or both).
- Upgrade to Expo SDK 58. It fixes the `decode-uri-component` advisory in
  expo-router's deep-link parsing (moderate DoS, ships in the app). Everyone on
  the team needs an Expo Go that supports SDK 58. It also adds `usePreventRemove`
  (documented from SDK 58), which the recipe edit screen can use to ask before
  discarding unsaved changes.
- Known `npm audit` advisories with no upstream fix yet, dev tooling only (not in
  the app): `braces` (Metro/Jest), `node-forge` (Expo CLI), the copy of `zod`
  nested inside `@expo/cli`, and `uuid` under `@expo/ngrok`. `@expo/ngrok` is a
  dev dependency so `expo start --tunnel` works on campus Wi-Fi; installing it
  globally doesn't work on Windows, because Expo CLI can't find npm's global folder. The app's own `zod` is ^4.6.7, which has the
  memory-exhaustion fix (GHSA-mrhx-c7xc-m3w5). Re-check with
  `npm audit` each sprint. Never run `npm audit fix --force` (it downgrades Expo
  and Firebase).
- `package.json` `overrides` force `@grpc/grpc-js` ^1.13.6 (Firestore still pins
  ~1.9) and `js-yaml` ^4.1.1 under `@istanbuljs/load-nyc-config`. Remove each
  override once the upstream package updates its own dependency.
