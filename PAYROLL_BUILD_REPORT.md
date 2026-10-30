# Payroll / lunch / geocode build report

Branch: `local/payroll-lunch-geocode` (nothing committed, pushed, or deployed; nothing written to the live database).

## Status

| Part | State |
|---|---|
| A. Auto-geocode job addresses | Done (code + migration). Not deployed. |
| B. Automatic unpaid lunch | Done + unit tests. |
| C. Owner payroll timesheet page | Done + unit tests for the math/CSV. UI not exercised against a real database. |
| Daily owner summary | Done, disabled by default. |
| `npm run build` | Passes. |
| `test:shift`, `test:geofence`, `test:edge-security` (existing) + `test:geocode`, `test:payroll` (new) | All pass. |

## Migrations to apply (in order, with Preston's OK)

1. `supabase/migrations/20261029040032_job_site_geofence.sql` (already on the branch, not applied)
2. `supabase/migrations/20261029043709_shift_time_segments.sql` (already on the branch, not applied)
3. **`supabase/migrations/20261029120000_job_geocode_status.sql`** (new)
   - `jobs.geocode_status` (`pending/ok/manual/failed/no_address/stale`), `geocoded_address`, `geocode_source`, `geocoded_at`
   - Existing pinned rows are marked `manual`
   - `BEFORE UPDATE OF location` trigger: unpinned → `pending`; pinned → keeps coordinates, marks `stale`. **Update-only, so the SMS insert path is unaffected.**
4. **`supabase/migrations/20261029120100_payroll_lunch_timesheets.sql`** (new)
   - `time_segments.kind` allows `'lunch'`
   - `payroll_settings` (one row): lunch on, 11:00–11:30, unpaid; week starts Monday; OT > 40 h; travel flag > 90 min; daily summary **off**
   - `owner_edited_at/by` on `shifts` and `time_segments`, plus a trigger so a phone replaying an old upsert can't undo an owner edit
   - `payroll_edit_audit` (who, when, original row, new row, note)
   - `payroll_approvals` (day/week)
   - Security-definer RPCs, owner only (`is_owner()`): `payroll_edit_segment`, `payroll_insert_segment`, `payroll_delete_segment`, `payroll_edit_shift`. Each one writes the audit and clears that day's and week's approval.
   - RLS: workers read their own audit and approval rows; owners read and write everything. Existing office read access on shifts/segments is unchanged.

### Deploy order (important)
- Apply migration 4 **before** shipping this app build to phones. Even if that slips, it's safe: a phone doesn't insert lunch rows until it has read `payroll_settings` once (`LUNCH_UNCONFIRMED`). Without that guard, the server would reject a `'lunch'` row, and the outbox stalls behind a failed row.
- Deploy `geocode-job` (and redeploy `super-processor` so it bundles `_shared/geocode*.ts`) after migration 3.
- `payroll-daily-summary` has `enabled = false` in `supabase/config.toml`. Don't deploy it until it's wanted.

## Files

### New
- `supabase/functions/_shared/geocode.ts`: pure geocoder. US Census first, then Nominatim. Arizona bias: appends ", AZ" and rejects matches outside AZ unless the address names another state. Placeholder detection, and `lat, lng` parsing.
- `supabase/functions/_shared/geocodeJob.ts`: looks up and stores a job's pin. The write is filtered on `latitude is null`, so existing coordinates are **never** overwritten. The only exception is `replaceStale`, which is filtered on `geocode_status = 'stale'` and only sent by the Fix-location "edit address" flow.
- `supabase/functions/_shared/geocodeAfterInsert.ts`: SMS post-insert runner. Never rejects.
- `supabase/functions/geocode-job/index.ts`: edge function for owner and crew (office rejected). Takes `{jobId}` or `{jobIds}` (≤10, spaced 1.1 s apart).
- `supabase/functions/_shared/payroll.ts`: pure payroll math (days, weeks, OT, per-job travel/on-site, anomalies, CSV, summary text).
- `supabase/functions/payroll-daily-summary/index.ts`: owner SMS summary. Off by default. Auth is a shared secret header or an owner JWT. Supports `dryRun`.
- `src/lib/shift/lunch.ts`: lunch config, window math, and settings parsing.
- `src/lib/jobGeocode.ts`, `src/hooks/useJobGeocodeSweep.ts`, `src/components/JobLocationFix.tsx`: pin badge, Fix location dialog, and a background sweep for today's and upcoming unpinned jobs.
- `src/lib/payroll/data.ts`, `src/lib/payroll/print.ts`, `src/components/payroll/PayrollView.tsx`, `PayrollDayDetail.tsx`, `PayrollSettingsPanel.tsx`
- `scripts/backfill-job-geocodes.ts` (`--dry-run`, `--limit N`, `--include-failed`)
- `scripts/lunch-checks.ts`, `scripts/geocode-checks.ts`, `scripts/payroll-checks.ts`
- `supabase/migrations/20261029120000_job_geocode_status.sql`, `supabase/migrations/20261029120100_payroll_lunch_timesheets.sql`

### Modified
- `supabase/functions/super-processor/index.ts` (SMS): **only** adds `geocodeJobInBackground()` and calls it right after each successful `jobs` insert (log_job, schedule_job). It is a lazy `import()` run under `EdgeRuntime.waitUntil`, wrapped in try/catch with `.catch`. It returns synchronously, never throws, and the TwiML reply doesn't wait on it. Even a load error in the geocode module can't break the function. Insert rows, replies, alerts, and paging are unchanged.
- `src/lib/shift/machine.ts`, `types.ts`, `storage.ts`, `src/hooks/useShiftTracker.ts`: lunch insertion, resume logic, and loading the lunch window from `payroll_settings`.
- `src/components/TimeCardView.tsx`: Lunch rows. On-site total excludes lunch. Shows the lunch notice.
- `src/hooks/useDispatchData.ts`, `src/lib/data.ts`, `src/components/ActiveJobsModal.tsx`: background geocode after create or address change, plus the new `geocodeStatus`/`geocodedAddress` fields.
- `src/components/JobCard.tsx`, `Dashboard.tsx`: pin badge and Fix location (owner/crew).
- `src/components/AppLayout.tsx`, `Sidebar.tsx`, `types.ts`: owner-only **Payroll** view, plus the geocode sweep.
- `supabase/config.toml`: `geocode-job` (enabled) and `payroll-daily-summary` (**enabled = false**).
- `scripts/shift-checks.ts`: test config now includes `lunch`. `package.json`: `test:shift` also runs the lunch checks. New scripts `test:geocode` and `test:payroll`.
- `docs/mobile-arrival.md`: migration order, auto-geocoding, lunch and payroll.

## Behavior notes
- **Lunch:** a shift that is open at the lunch start gets a `lunch` segment. The open segment is closed exactly at the start. After lunch, the phone resumes the same place if it's still inside that fence, otherwise whatever fence it's in now, otherwise Travel. Location samples during lunch don't switch segments. A phone that slept through lunch still records it on its next sample or at clock-out. Clock-out or the safety stop during lunch ends lunch there. A shift that starts after 11:00 gets no lunch that day. Weekends are included.
- **Payroll day** = the Phoenix date of clock-in. Paid = shop + travel + on-site (+ lunch if paid). Travel counts toward the job it drives to; otherwise it goes to "Travel — shop / no job". Weekly OT is flagged, and the OT minutes are assigned to the day that crosses the threshold.
- **Anomalies:** auto-stopped without clock-out (marked resolved after an owner corrects it), travel over the limit, on-site time at an unpinned job, and still clocked in from a previous day.

## Test output (final run)
```
> tsc && vite build
✓ built in 6.40s                       (build exit=0; only the existing >500 kB chunk warning)
$ npm run test:shift
shift checks passed
start locate checks passed
lunch checks passed
$ npm run test:geofence
geofence checks passed
$ npm run test:edge-security
edge-security-checks: ok
$ npm run test:geocode
geocode checks passed
$ npm run test:payroll
payroll checks passed
(all exit=0)
```
I also ran a strict `tsc --strict` pass over the shared edge modules and the new test scripts. It is clean.

## Environment note
`node_modules/capacitor-job-geofence` (a `file:` dependency) wasn't linked, so `tsc` failed before any of these changes. I ran `npm install --package-lock=false` to link it. `package-lock.json` is unchanged.

## Unfinished / not verified
- **Edge functions were not run.** There's no Deno or Supabase CLI here. `geocode-job`, `payroll-daily-summary`, and the `super-processor` change have only been typechecked through their shared modules. Run `supabase functions serve` and send a test SMS before deploying `super-processor`.
- **The live Census and Nominatim APIs were not called.** Tests use a fake fetch. Run the backfill with `--dry-run` first to see real matches.
- **The Payroll page has not been clicked through against a database.** The migrations aren't applied, and there's no owner login in this environment. The SQL RPCs and triggers have not been executed.
- **No scheduler is set up for the daily summary.** It needs a pg_cron/scheduler POST with the `x-payroll-summary-secret` header and the `PAYROLL_SUMMARY_SECRET` secret, plus the settings toggle and a phone number.
- **The "unpinned job" flag only covers jobs that have time logged against them.** It can't flag a worker's *scheduled* jobs that are unpinned, because `technicians` has no link to `auth.users`/`user_roles`.
- **A deleted segment can come back.** If the owner deletes a segment while the phone still has that same row queued (unsynced), the phone's replay re-inserts it. This is rare, since edits are only allowed after clock-out, but there's no tombstone.
- **Editing shift times:** `payroll_edit_shift` doesn't move segment boundaries. Payroll clips segments to the new clock-in/out, so the totals are correct, but the segment list may show times outside the shift.
- **Hours are rounded per category to whole minutes,** so per-job lines can differ from the day total by about a minute.
