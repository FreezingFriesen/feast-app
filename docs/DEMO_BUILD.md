# Demo build (tradeshow, N-22)

How to build the app that guests install at the tradeshow:
- **Android:** an APK installed from a link or QR code.
- **iPhone:** a TestFlight public link.

Guests sign up with their own accounts on a **separate demo Firebase project**, which is
deleted after the show. There is no shared demo account.

The demo build is a standalone release build of the same Expo Go-compatible code, with
no development build and no extra native libraries. Release builds refuse the `memory`
backend, so the build always uses Firebase.

## What's in the repo
- `app.json`:
  - `ca.feastapp.feast` as the iOS bundle identifier and the Android package. This is
    permanent: changing it makes a different app.
  - `usesNonExemptEncryption: false` (the app only uses HTTPS).
  - iPhone only.
  - No Face ID permission (the app doesn't use biometrics).
- `eas.json`, profile `demo`:
  - Android: `internal` + `apk`.
  - iOS: `store` (TestFlight). An internal iOS build only installs on registered devices,
    so it's no use for guests.
  - `EXPO_PUBLIC_BACKEND=firebase`.
  - Reads the rest from the EAS **`preview`** environment.
  - Build numbers are kept by EAS (`appVersionSource: "remote"`, `autoIncrement`), so
    app.json has no `buildNumber` or `versionCode`.
- `src/services/__tests__/buildConfig.test.ts` checks all of this. It also fails if
  `eas.json` holds any build variable other than `EXPO_PUBLIC_BACKEND`.

The six `EXPO_PUBLIC_FIREBASE_*` values live only in the EAS `preview` environment. They
identify the project and aren't secrets (the Security Rules protect the data), but they
stay out of the repo, like `.env.local`. `.env.local` is gitignored, so EAS never uploads
it, and a demo build can't pick up the development project.

## One-time setup

**Before you start:** an Expo account, and an Apple Developer Program membership on the
maintainer's Apple ID. Enrolment can take a day or two.

### 1. Demo Firebase project (Firebase console)
1. Create a project (e.g. `feast-demo`). Create its Firestore database in production
   mode. Add a **Web** app and copy its six config values.
2. In Authentication:
   - Enable Email/Password.
   - Turn on email enumeration protection.
   - Set a password policy with a minimum length of 8.
3. Raise the **sign-up quota** (Authentication → Settings) for the show days. Firebase
   limits new accounts per IP address per hour, and every guest on the booth Wi-Fi shares
   one IP.
4. Deploy the rules. A person does this, not a script:
   ```
   npx firebase-tools@15 login
   npx firebase-tools@15 deploy --only firestore:rules --project <demo-project-id>
   ```

### 2. Dependencies
Expo Doctor reports seven Expo packages one patch release behind SDK 57. Bring them up to
date before the first build, then run the checks:
```
npx expo install --fix
npx tsc --noEmit
npm run lint
npm test
```

### 3. EAS
```
npm install -g eas-cli        # or prefix each command with: npx eas-cli@latest
eas login
eas init                      # links the project and adds extra.eas.projectId to app.json; commit it
eas env:create --environment preview --name EXPO_PUBLIC_FIREBASE_API_KEY --value "<value>" --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN --value "<value>" --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_FIREBASE_PROJECT_ID --value "<value>" --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET --value "<value>" --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --value "<value>" --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_FIREBASE_APP_ID --value "<value>" --visibility plaintext
eas env:list --environment preview
```
- **Visibility:** use `plaintext` or `sensitive`, never `secret`. The values are built
  into the app anyway, so `secret` would only suggest a protection they don't get.
- **Don't add `EXPO_PUBLIC_BACKEND`:** it comes from `eas.json`.
- **If a flag is rejected,** check `eas env:create --help`. The expo.dev project page has
  the same form under Environment variables.

## Build

### Android (no Apple credentials)
```
eas build --platform android --profile demo
```
- Let EAS generate the keystore. It keeps it, and later Android builds need the same one.
- The build log should list the six variables from `preview`, and
  `EXPO_PUBLIC_BACKEND=firebase`.
- The build page has an install link and QR code.

### iOS (needs the maintainer's Apple credentials)
```
eas build --platform ios --profile demo
eas submit --platform ios --profile demo --latest
```
- `eas build` asks you to sign in to Apple so EAS can create the distribution certificate
  and provisioning profile.
- `eas submit` uploads to App Store Connect, and can create the app record. The App Store
  name must be unique, so have a fallback ready if "Feast" is taken (e.g. "Feast: Meal
  Planner").
- `--auto-submit` on the build command does both in one step.

Then, in App Store Connect → TestFlight:
1. Fill in Test Information: beta description, feedback email, and a privacy policy URL
   if it asks (see "Privacy" below).
2. Give Beta App Review the sign-in details of a test account you created in the demo
   project. They go to Apple only, never into the app.
3. Create an external testing group, add the build and submit it for Beta App Review. A
   first build often takes about a day.
4. Turn on the group's **Public Link**: that's the iPhone QR code. Guests need the
   TestFlight app installed. Builds expire after 90 days.

## Check on real phones before the show
This is the first time the app runs against a real Firebase project on a phone, so do it
early. Run these checks from "When the Firebase project is connected" in
`PROJECT_PLAN.md`:
- Check 1: sessions survive a restart.
- Check 2: the session fits SecureStore.
- Check 4: account deletion leaves nothing behind.
- Check 5: restore on a second phone.
- Check 7: sync offline (airplane mode, then reconnect).

Also check:
- The green splash screen with the logo. Expo Go never shows it.
- Signing up on mobile data, away from Wi-Fi.
- Android's "Install unknown apps" and Play Protect "unrecognized developer" prompts, so
  booth staff can walk guests through them.

## QR codes
- Make one for iPhone (the TestFlight public link) and one for Android (the APK link).
- The Android link changes with every build. Print it after the final build, or point the
  QR code at a short link you can update.

## Privacy
Guests enter an email address and may add allergies, which is health-related personal
information. On the booth sign and in the TestFlight description, say:
- what the app collects
- that every demo account and its data are deleted after the show (give the date)
- who to contact

Apple may ask for this note as a privacy policy URL.

## After the show
These steps are destructive and can't be undone. A person does them.
1. **Delete the demo Firebase project.** That removes every guest's Auth account,
   profile, username, recipes and meal plans in one step. To keep the project instead,
   delete the Auth users in the console and run
   `npx firebase-tools@15 firestore:delete --recursive --all-collections --project <demo-project-id>`.
2. **Expire the TestFlight build** in App Store Connect, and stop sharing the APK link.
3. Copies saved on guests' phones stay there until they uninstall. They can't sync to a
   deleted project.

## Note
The EAS `preview` environment now holds the demo backend. A real preview build later
needs its own environment, or new values there.
