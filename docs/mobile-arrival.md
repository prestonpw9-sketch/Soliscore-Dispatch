# Job-site arrival (Android sideload and iOS TestFlight)

Phase 1 watches job sites and asks the crew to update a time card. The Vercel web app is unchanged as a website: `npm run build` still emits the Vite bundle, and arrival checks in the browser run only while the tab is open. Background alerts need the Capacitor shell below.

The SQL migration `supabase/migrations/20261029040032_job_site_geofence.sql` is **not applied**. Do not run it against the hosted project until Preston says so. Until those columns exist, jobs have no coordinates and both the website and the phone app stay quiet.

Nothing in this feature calls the Twilio SMS edge functions or the superintendent texting flow.

## What the phone does

- Default window: weekdays 6:00 AM–4:00 PM America/Phoenix. End is 4:00 PM sharp (the 4 PM hour is off). Change the window on the Time Card screen; it is stored on that phone.
- Outside that window the app removes job geofences. Android schedules the next start with AlarmManager. iOS stops region monitoring and uses a significant-location wake (plus the next time the app opens) to arm regions again at the start of the window.
- On enter: a local notification, `You're at <job name>, update your time card?`. Tapping it opens Time Card for that job.
- Radius defaults to 90 meters (about 300 feet). iOS monitors at most 20 regions. Android monitors at most 100.
- The in-app Time Card clock-in is stored on the phone only. It does not write to Supabase.

## Coordinates

Addresses are not geocoded automatically. After the migration is applied, look up one address and paste the result onto the job:

```bash
node --experimental-strip-types scripts/geocode-job-address.ts "100 E Congress St, Tucson, AZ"
```

That command only prints JSON. It does not update the database. The helper is `src/lib/geocodeAddress.ts` (OpenStreetMap Nominatim, one address at a time).

## One-time setup

From the repo root, with Node 22:

```bash
npm install
npm run build
npx cap sync
```

`capacitor.config.json` uses `webDir: dist` and leaves the Vite `base` at `/`, so the Vercel deploy is the same build.

App id: `com.solidcoreplumb.dispatch`.

You need a JDK 21 and Android Studio (current Otter / SDK 36 line) for the APK. iOS builds need a Mac with Xcode 26, CocoaPods or Swift Package Manager (Capacitor 8 uses SPM), and an Apple Developer Program account.

## Android APK for sideloading

1. Install [Android Studio](https://developer.android.com/studio) and accept the SDK 36 / build-tools install.
2. `npm run build && npx cap sync android`
3. `npx cap open android`
4. In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
5. The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.
6. Copy it to the phone (USB, Drive, or `adb install -r app-debug.apk`).
7. On the phone, allow install from that source. Play Protect may warn because the APK is not from Play. That is expected for a sideload.
8. Open **ITDG Dispatch**, sign in with a crew account that already has a `user_roles` row, and allow location **all the time** plus notifications. Android 11+ asks for background location on its own screen after the foreground allow.
9. The phone needs Google Play services. Geofences come from `GeofencingClient`, not a paid plugin.

Release signing (when you outgrow the debug APK): **Build → Generate Signed Bundle / APK**, create a keystore, and keep the keystore out of git. Sideloading a release APK still does not need Play Store review.

## iOS through TestFlight

1. Enroll the company Apple Developer account at [developer.apple.com](https://developer.apple.com/programs/) ($99/year). A personal free team cannot ship TestFlight.
2. On a Mac: `npm run build && npx cap sync ios && npx cap open ios`
3. In Xcode, select the **App** target:
   - Team: the company developer team
   - Bundle identifier: `com.solidcoreplumb.dispatch` (register this App ID in Certificates, Identifiers & Profiles)
   - Signing: Automatically manage signing
4. Confirm the location strings are still in `ios/App/App/Info.plist` after a sync (they are checked in):
   - `NSLocationWhenInUseUsageDescription`
   - `NSLocationAlwaysAndWhenInUseUsageDescription`
   - `UIBackgroundModes` includes `location`
5. **Product → Archive**. When the archive finishes, **Distribute App → TestFlight & App Store → Upload**.
6. In App Store Connect, wait until the build finishes processing. Add the crew as internal testers (same App Store Connect team, up to 100, no Beta App Review) or as external testers (Beta App Review the first time).
7. Testers install **TestFlight**, accept the invite, and install **ITDG Dispatch**.
8. On first launch, choose **Always** for location so arrival can alert while the app is in the background during work hours. When In Use only covers the app while it is on screen.

Apple still requires a privacy policy URL on the TestFlight listing. The app already serves `/privacy`.

## Still needs a device

This repo cannot run an Android emulator image or Xcode here. Before handing phones to the crew, confirm on a real device:

- The permission sheets match the copy above, and background location is actually granted.
- Entering a geocoded site during the work window shows the notification, and tapping it opens Time Card.
- After 4:00 PM Phoenix (and on Saturday/Sunday) a site entry does not notify, and the next weekday morning arms monitoring again without a reinstall.
- A cold start from the notification still opens the right job.
- The Vercel site at `app.solidcoreplumb.com` still loads in a desktop browser with no Capacitor prompt until a job has coordinates and it is during work hours.
