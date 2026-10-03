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
  explicitly on React Native.
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

users/{uid}/mealPlans/{planId}     // stores recipe IDs + servings, never copies
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
- Plan Sprints 2 and 3; confirm how the rubric's hours-per-person applies to a
  one-week Sprint 1.
- Stakeholder communication plan for Sprint 1 (missing from the plan template).
- Decide which phones the team tests on (iOS, Android, or both).
