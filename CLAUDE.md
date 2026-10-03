# Recipe & Meal Planning App

Mobile app (Expo / React Native + Firebase) for storing recipes, planning meals,
and generating grocery lists. Currently a capstone prototype (PROJ 309), built by a
team of 5, then released as a paid app (7-day free trial, no free tier) by one
maintainer after the capstone.

# Project plan and feature list
@docs/PROJECT_PLAN.md

Before starting a task, check the plan for the feature ID (#n or N-nn), the
decisions already made, and the current sprint. When a feature is finished, tick
its checkbox in `docs/PROJECT_PLAN.md`.

# Architecture rules
- **Composition over inheritance.** Do not create class hierarchies or use
  `extends` to share behavior. Build behavior from small, single-purpose objects
  and functions, and pass dependencies in (dependency injection).
- **Hide Firebase behind our own interfaces** (e.g. `RecipeRepository`,
  `AuthService`, `SyncService`). Screens and components never import Firebase
  directly. After the capstone we will swap the Firebase JS SDK for React Native
  Firebase, so only the implementations of these interfaces should change.
- **Offline-first.** The device's local database is the source of truth. Reads and
  writes go to local storage first. Changes sync to Firestore when the user is
  online. Recipes, meal planning and grocery list generation must work fully
  offline. Login is the only thing that requires a connection.
- **Sync conflicts: last edit wins**, using each record's `updatedAt` timestamp.
  Deletes are soft (`deletedAt`), so a sync cannot bring a deleted record back.
- **Expo Go compatibility until the capstone prototype is done.** Do not add any
  library that needs native code or a development build. Check Expo Go
  compatibility before adding a dependency, and tell me if a requested feature
  would need one.

# Security rules (secure by design)
- **Validate every field a user can touch**: type, length, format and range, using
  an allowlist (reject by default, never blocklist). This covers forms, search
  boxes, recipe fields, profile fields, route/query params and imports.
- **Validate untrusted data from outside the app the same way**: API responses,
  imported recipes, and data read back from storage or sync.
- **Validation also lives on the server.** Mirror the client validation in
  Firebase Security Rules. Never rely on client-side checks alone.
- **No secrets in the app or repo.** API keys stay server-side (Cloud Function or
  scheduled sync that writes validated data to Firestore). Never use
  `EXPO_PUBLIC_` variables for secrets. `.env` files are in `.gitignore`.
- **Session tokens go in secure storage** (`expo-secure-store`), never in plain
  AsyncStorage. Sessions last 30 days (store the login date, sign out after 30
  days). Account deletion may require re-authentication.
- **Usernames are unique** (case-insensitive), enforced with a `usernames`
  collection and Security Rules, not only in the app. Login is by email.
- **Least privilege in Security Rules**: a user can only read and write their own
  data.
- When subscriptions are added, check status **server-side and in the app**. The
  server check is authoritative.
- Do not log personal data, tokens or passwords.

# Working style
- Keep changes small and explain which feature ID they relate to.
- Write tests for validation logic and for the sync/conflict logic.
- If a request conflicts with these rules, say so instead of working around them.
