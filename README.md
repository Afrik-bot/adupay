# AduPay

Community money app for Côte d'Ivoire and its diaspora: Tontine OS, Payer pour, Score Communauté.
See [CLAUDE.md](CLAUDE.md) for the rules every change must follow.

**Status:** all 15 phases built, sandbox only. No real money moves: payments go through `SandboxProvider`,
WhatsApp/SMS through a simulated `NotificationProvider`, airtime through `SandboxAirtimeProvider`.

## Features

- **Tontine OS**: create a group with a 4-step wizard, invite by WhatsApp link, pay a share from any linked wallet,
  automatic rounds, payouts, penalties and votes on rules, manager dashboard with statements (CSV/PDF).
- **Payer pour**: diaspora senders pay verified schools, clinics, pharmacies, utilities or a relative's tontine share
  by card in EUR/USD/CAD, with a live timeline and a public tracking link; the payee confirms receipt in its portal.
- **Épargne & Score Communauté**: savings goals with automatic top-ups, and a consent-based score from contribution history.
- **AduPay Connect**: airtime and data top-ups on Orange, MTN and Moov for yourself or a relative (AduPay balance,
  Mobile Money or diaspora card), favourites and "Répéter"; **Data offerte** rewards on-time tontine payments with data
  bundles within a monthly budget and per-member cap ([rules](docs/features/data-offerte.md)).
- **Channels**: `*123#` USSD simulator and a notifications centre for the simulated WhatsApp/SMS messages.
- **Admin & compliance**: KYC/KYB queues, transaction search, risk cases, sanctions screening stub, FX and fee settings,
  reward rules and budget, read-only audit log, KPIs.
- French by default, English second; installable PWA with offline viewing of key screens; works at 360px.

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

The development project is **AduPay** (`xhjvajbivwabczgwgipk`, region West EU / Paris). Keys live in `.env.local` only.

To set up a fresh clone or a new project:

```powershell
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push --remote   # applies supabase/migrations; without --remote the CLI targets a local Docker DB
npm run db:types:remote         # regenerates src/types/database.ts from the live schema
```

For demo data, open the Supabase SQL editor, start a **new, empty** query, paste `supabase/seed.sql` once and run it (fictional users and payees). It can only run once per database. To copy it with the accents intact:

```powershell
Get-Content supabase\seed.sql -Raw -Encoding UTF8 | Set-Clipboard
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm test` | Vitest: unit tests, RLS tests, ledger and payment tests (PGlite) |
| `npm run test:db` | Real-concurrency ledger test; needs `TEST_DATABASE_URL` pointing at an **empty** Postgres DB |
| `npm run test:e2e` | Playwright on a 360px phone viewport |
| `npm run typecheck` / `npm run lint` / `npm run format` | TypeScript, ESLint, Prettier |
| `npm run db:types` | Regenerate `src/types/database.ts` from the migrations |

## End-to-end tests

Playwright drives the three core journeys against the configured Supabase project, one file at a time:
`01-admin-kyc` (a member's documents approved by an admin), `02-tontine` (a full round paid in and paid out)
and `03-payer-pour` (a school paid from abroad confirms receipt).

1. In Supabase → Authentication → Providers → Phone, add two **test phone numbers** with fixed codes
   (no SMS is sent), e.g. `2250700000099=123456` and `2250700000098=123456`.
2. Give user A the admin role once (SQL Editor):
   `insert into public.user_roles (user_id, role) select id, 'admin' from public.profiles where phone = '2250700000099' on conflict do nothing;`
3. Run, with the dev server on port 3000 (Playwright starts it if needed):
   ```powershell
   $env:E2E_USER_A = "CI:0700000099:123456"; $env:E2E_USER_B = "CI:0700000098:123456"; npm run test:e2e
   ```

The journeys leave test data behind (a tontine, a payee, payments in the sandbox) and are written to be re-run.
Once B reaches KYC tier 2 the KYC journey skips itself.

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
