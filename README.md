# AduPay

Community money app for Côte d'Ivoire and its diaspora: Tontine OS, Payer pour, Score Communauté.
See [CLAUDE.md](CLAUDE.md) for the rules every change must follow.

**Status:** phases 1–3 of 14 (app shell, database schema with RLS, ledger core with sandbox payments).
No real money moves: all payments go through `SandboxProvider`.

## Setup on Windows (PowerShell)

1. Install Node.js LTS and Git:

   ```powershell
   winget install OpenJS.NodeJS.LTS
   winget install Git.Git
   ```

2. Install dependencies and create your local env file:

   ```powershell
   npm install
   Copy-Item .env.example .env.local
   ```

   Fill in `.env.local` (see comments in the file). `npm test` and the app shell work without it; anything that talks to Supabase needs it.

3. Run the tests (no database needed: SQL runs in PGlite, an in-process Postgres):

   ```powershell
   npm test
   ```

4. Start the app at http://localhost:3000:

   ```powershell
   npm run dev
   ```

5. End-to-end tests (first time only: `npx playwright install chromium`):

   ```powershell
   npm run test:e2e
   ```

## Connecting Supabase

Not done yet; there is no project connected. When you have one:

```powershell
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push            # applies supabase/migrations
npm run db:types:remote         # regenerates src/types/database.ts from the live schema
```

For demo data, run `supabase/seed.sql` in the Supabase SQL editor (fictional users and payees).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm test` | Vitest: unit tests, RLS tests, ledger and payment tests (PGlite) |
| `npm run test:db` | Real-concurrency ledger test; needs `TEST_DATABASE_URL` pointing at an **empty** Postgres DB |
| `npm run test:e2e` | Playwright on a 360px phone viewport |
| `npm run typecheck` / `npm run lint` / `npm run format` | TypeScript, ESLint, Prettier |
| `npm run db:types` | Regenerate `src/types/database.ts` from the migrations |

## Layout

```
supabase/migrations/   schema, RLS, ledger core (all money logic is here)
supabase/seed.sql      3 demo users, 2 tontines, 8 verified Abidjan payees
supabase/tests/        PGlite harness + RLS and ledger tests
src/server/payments/   PaymentProvider interface, SandboxProvider, PaymentService, reconciliation
src/app/api/           sandbox webhook (signed) and reconciliation cron
src/app/(app)/         mobile shell: Accueil, Tontines, Payer pour, Épargne, Profil
src/lib/money.ts       FCFA/EUR/USD/CAD formatting and parsing (integer minor units)
messages/              fr.json (default) and en.json
```

## How money moves

1. `PaymentService.initiate` calls `create_payment` (idempotent on its key). A payout immediately reserves its funds.
2. The provider is asked to collect or pay out and returns a reference.
3. The rail calls `/api/webhooks/sandbox` (HMAC-signed, 5-minute replay window); `settle_payment` posts the double-entry transaction.
4. `/api/cron/reconcile` (every 15 minutes on Vercel) asks the rail for each open payment's status, applies missed webhooks, and records disagreements as `risk_events`.

Ledger entries are append-only (enforced by trigger), every transaction must balance (checked in the function and again at commit), and accounts that must not go negative are locked and checked inside the same transaction.
