# Security remediation — leaked Gemini API key

**Date:** 2026-07-10  
**Repository:** https://github.com/prestonpw9-sketch/Soliscore-Dispatch  
**Status:** Remediated on all git branches; replacement key must be created outside this repo.

## Incident

A Google Gemini / Generative Language API key was committed in `.env` on 2026-06-08 and remained reachable in git history after `.env` was later deleted. Google disabled/locked that key.

The leaked value was of the form `VITE_GEMINI_API_KEY=AQ.…` (never re-commit real keys).

## Remediation completed

1. **Revoked** the compromised key in Google AI Studio / Cloud Console (owner confirmed).
2. **Removed `.env` from all branch history** with `git filter-repo --invert-paths --path .env` and force-pushed every branch (`main` and all `cursor/*` / `vercel/*` heads).
3. **Verified** every remote branch tip and its reachable history no longer contain the key material.
4. **Hardened ignore rules** so env files cannot be committed again:
   - `.gitignore` ignores `.env`, `.env.*` (except `.env.example`), certs, and local tooling state.
5. **Added `.env.example`** with placeholders only — documents `VITE_GEMINI_API_KEY` without a real value.
6. **Application code** reads the key only from `import.meta.env.VITE_GEMINI_API_KEY` (see `src/services/ai/geminiService.ts`); no hardcoded secrets.

## Residual note (closed PR refs)

GitHub keeps immutable `refs/pull/*/head` for closed PRs #1–#6. Those hidden refs can still resolve the pre-rewrite blob by exact historical SHA. Branch clones and normal browsing of `main` do **not** include the secret.

Owner follow-up to eliminate residual public SHA access (optional but recommended before Google re-enables unrestricted key creation if still blocked):

- Make the repository **private**, or
- Contact **GitHub Support** to purge unreachable objects from closed pull-request refs, or
- Delete and recreate the repository from the cleaned history.

## How a replacement key must be stored

- Local / CI / hosting secrets only: `VITE_GEMINI_API_KEY=…` in `.env` (gitignored), Vercel env, or Cursor injected secrets.
- Prefer HTTP referrer restrictions for browser keys (e.g. `https://app.solidcoreplumb.com/*`, `http://localhost:5173/*`).
- Never commit `.env` or paste keys into source, PRs, or chat logs.

## Appeal / evidence summary for Google

| Step | Done |
|------|------|
| Compromised key revoked | Yes (owner) |
| Secret removed from all branch histories | Yes (2026-07-10 force-push) |
| Repo ignore rules prevent re-commit | Yes (`.gitignore` + `.env.example`) |
| Key not hardcoded in application source | Yes |
| New key will use env/secrets only + referrer restrict | Planned |

Public proof commit on `main`: history rewrite + `cd2238b` (“Secure env handling: harden gitignore and add .env.example”).
