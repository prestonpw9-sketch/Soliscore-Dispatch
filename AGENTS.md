# AGENTS.md

## Cursor Cloud specific instructions

This repo is a single **Vite + React + TypeScript SPA** (`solidcore-dispatch`, "ITDG Plumbing Crew Dispatch & Jobs Tracking Estimator"). Production is deployed at `app.solidcoreplumb.com` and is backed by a **hosted Supabase project** (`keyldymctpsvdjllliio`). There is no separate backend server — all logic runs in the browser or in Supabase (Postgres/Auth/Storage) plus optional Deno edge functions in `supabase/functions/` (Twilio SMS/voice).

### Standard commands (see `package.json`)
- Dev server: `npm run dev` → Vite on `http://localhost:5173`. Vite binds to `localhost` only (loopback); use `http://localhost:5173`, not `127.0.0.1` (a raw `127.0.0.1` curl can fail while `localhost` works). To expose externally use `npm run dev -- --host`.
- Build + typecheck (also the lint gate): `npm run build` (runs `tsc && vite build`). Typecheck only: `npx tsc --noEmit`. There is **no** separate ESLint/Prettier config and **no** test script.

### Backend / env (required to actually run the app)
- `src/lib/supabase.ts` **throws at import time** if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are missing (blank white screen + console error), so both must be present before the app renders anything.
- In Cursor Cloud these two are provided as **injected environment-variable secrets** (pointing at the hosted project `keyldymctpsvdjllliio` behind `app.solidcoreplumb.com`). Vite exposes `VITE_`-prefixed vars from `process.env` automatically, so **you do NOT need a committed `.env`** — just run `npm run dev` from a normal shell that has the secrets. **Gotcha:** a long-lived `tmux`/background shell started *before* the secrets were injected keeps a stale environment and will hit the "Missing VITE_SUPABASE_URL" error; start the dev server from a fresh shell (or write a local `.env`) in that case.
- Login is Supabase email/password (`LoginScreen.tsx`). A signed-in user is only admitted if they have a matching row in `public.user_roles` (role `owner`/`office`/`crew`); otherwise `AuthContext` immediately signs them out. New Supabase accounts therefore can't log in until a `user_roles` row exists.
- The SQL files in `supabase/migrations/` are **documentation-only** (they say so in comments) — the real/full schema (`jobs`, `technicians`, `customers`, `job_tasks`, `user_roles`, `project_bids`, …) lives on the hosted project, NOT in the repo. `supabase start` alone will therefore give you an **empty** public schema.

### Two ways to run a backend
1. **Against the hosted project (default / production parity):** use the injected `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` secrets (project `keyldymctpsvdjllliio`) plus a real login that has a `user_roles` row. This is what the running dev server uses.
2. **Fully local, self-contained fallback:** requires Docker + the `supabase` CLI (neither is preinstalled in the base image). Run `supabase start`, then hand-create the app tables (repo migrations won't), seed a user via the GoTrue admin API, and insert a `public.user_roles` row for it. Write a `.env` pointing at the local API (`http://127.0.0.1:54321`) with the local anon key from `supabase status`. Newer CLIs emit `sb_publishable_...` keys — these work as the anon key with `@supabase/supabase-js`.

### Gotchas
- Data fetches in `useDispatchData.ts` swallow errors (console-only), so a missing table degrades to empty lists rather than a crash — a blank dashboard usually means the backend schema/creds are wrong, not a frontend bug.
- Optional integrations fail gracefully and are not needed for the core app: Google Gemini AI assistant (`VITE_GEMINI_API_KEY`) and Twilio SMS/voice edge functions (`TWILIO_*`).
