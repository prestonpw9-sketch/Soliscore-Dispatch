# Job-site arrival and shift tracking (Android sideload and iOS TestFlight)

A shift starts with one clock-in at the shop and runs until clock-out. The phone switches segments on its own: Shop, then Travel while moving, then On site after a stop inside a job fence, then Travel again, then the next job or back to the shop. No extra taps and no second login.

The Vercel site is the same Vite build. In a browser tab, tracking runs only while that tab is open and a shift is clocked in. Background tracking is the Capacitor app.

These SQL files are **not applied**. Do not run them until Preston says so.

- `supabase/migrations/20261029040032_job_site_geofence.sql` adds job coordinates.
- `supabase/migrations/20261029043709_shift_time_segments.sql` adds the shop, shifts, segments, and battery samples, and caps a job fence at 200 m (about 650 ft).

Until those columns exist, the phone still records the shift locally and retries the sync. Nothing in this feature calls the Twilio SMS edge functions or the superintendent texting flow.

## What the phone does

- First Start shows a consent screen: location is recorded only while clocked in. Cancelling it says so. While the phone looks for a fix the button stays disabled and reads "Getting your location…", and Cancel stops that wait.
- Start does not trust the Android WebView location timeout. Permission, GPS, the background prompt, and the shop row each sit behind a deadline that uses a short interval plus a one-shot timer, armed before the request starts. High accuracy is tried first. If that times out, Start uses a last-known position (coarse, up to 60 seconds old) and the first watch update. Location services off, permission denied or not granted, a missing plugin, and "not at the shop" each have their own message. A reading counts as the shop when the distance minus the accuracy (capped at 100 m) is inside the shop radius.
- Android asks for location while the app is in use first, starts the shift, then asks for all-the-time. Start does not wait on that second prompt.
- Start is accepted only inside the shop geofence (Time Card → Shop). Save the shop latitude, longitude, and radius on the phone. An owner save is also queued for `shop_locations`.
- Driving starts after speed stays at or above the configured threshold (default 10 mph) for 30 seconds, or after the phone has been outside the current shop or job fence for that long.
- A job (or the shop, on the way back) starts only after the phone has been stopped inside that fence for the dwell time. Default is 4 minutes. The Time Card offers 3, 4, or 5. Driving through a site does not count.
- Job and shop radii stay between 30 m and 200 m. The default is 90 m, about 300 ft. A wider fence would overlap the next job.
- Travel segments and on-site segments are separate rows on the time card.
- The 6:00 AM–5:00 PM Phoenix weekday window is only a safety stop. It does not block clock-in. Crew usually finish by 4:30 PM; 5:00 PM is the default cutoff. A shift that is still open at the end of the window, or that runs longer than the window’s length (default 11 hours), closes itself as `auto_stop`.
- Segments and battery samples are queued on the phone and upserted by id. Replaying the queue after a dead zone updates the same rows. It does not insert duplicates.
- Battery percent is stored at clock-in, about every 15 minutes, and at clock-out.
- While moving, the native app uses high-accuracy GPS. While stopped it uses geofences, significant-location changes, and a slow fix. Android keeps a low-priority foreground notice for the shift so the system does not kill the tracker. Motion activity (driving vs still) switches those modes.

## Coordinates

Addresses are not geocoded automatically. After the geofence migration is applied, look up one address and paste the result onto the job:

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
8. On first launch, choose **Always** for location. Tracking runs only after Start, and only until clock-out. When In Use only covers the app while it is on screen.

Apple still requires a privacy policy URL on the TestFlight listing. The app already serves `/privacy`.

## Still needs a device

Preston's phone is the first device to test. This environment has no Android emulator image and no Xcode, so the native tracker has not been run on hardware. On that phone, confirm:

- The consent screen appears once, then Start works only at the shop. If GPS never arrives, the "Getting your location…" spinner clears on its own (about 30 seconds) with a specific error, and Cancel clears it sooner. Debug APK `versionCode` 2 installs over `versionCode` 1 when both are signed with the same debug key.
- A drive over about 10 mph becomes Travel, and a stop of a few minutes inside a job fence becomes On site, with no taps in between.
- Leaving the site and returning to the shop closes the job and, after the dwell, records Shop again.
- Airplane mode keeps segments on the phone. Turning service back on syncs them once, without duplicate rows, after the migrations are applied.
- Battery percent is present at clock-in and clock-out, and the drop across a real day is acceptable.
- Forgetting to clock out closes the shift at the safety time (default 5:00 PM Phoenix, or 11 hours after an after-hours start).
- The Android foreground notice and the iOS blue location pill appear only while the shift is open, and high-accuracy GPS quiets down while parked.
- The Vercel site still loads in a desktop browser and does not ask for location until Start on the time card.
