# AduPay

AduPay is a community money app for Côte d'Ivoire (launch market) and its diaspora in France, the US and Canada. Three pillars:
1. Tontine OS: digital rotating savings groups that collect from any wallet (Orange Money, MTN MoMo, Moov Money, Wave) or bank.
2. Payer pour: diaspora senders pay verified payees (schools, clinics, pharmacies, utilities, tontines) directly, with proof.
3. Community credit: consent-based score from contribution history, shared only with licensed lenders.

AduPay Connect: airtime/data top-ups and data rewards, via a licensed distributor (sandbox until signed).

AduPay never holds customer funds itself. A BCEAO-licensed partner (EME or bank) holds funds; AduPay is the software, ledger and distribution layer. Until partners are signed, ALL money movement goes through SandboxProvider.

## Stack
- Next.js (App Router) + TypeScript (strict) + Tailwind + shadcn/ui
- Supabase: Postgres, Auth (phone OTP), Storage, Row-Level Security
- Database changes only through SQL migrations in supabase/migrations
- next-intl for i18n: French is the default, English second
- Vitest for unit tests, Playwright for end-to-end tests
- Deploy: Vercel (app) + Supabase (database)
- Developer machine is Windows; any shell commands must be PowerShell

## Money rules (never break these)
- Store amounts as integers in minor units (XOF has no decimals: 150000 = 150 000 FCFA; EUR/USD/CAD in cents). Never use floats for money.
- Every money movement is a double-entry transaction in ledger_entries: debits equal credits. ledger_entries is append-only (no UPDATE or DELETE, enforced by trigger).
- Balances are derived from the ledger, never stored as editable numbers.
- Money movements run inside Postgres functions in a single transaction, called via RPC. No money logic in the browser.
- Every payment request carries an idempotency key; retries must not double-charge.
- All rails sit behind the PaymentProvider interface: collect, payout, getStatus, handleWebhook. Webhooks are signature-checked.
- Never store card numbers, PINs or real ID numbers in plain text. Card entry is sandbox only.

## Security
- RLS on every table. Users see only their own data; group members see their group; admins use a separate user_roles table.
- Service-role key only on the server, never in client code.
- Every admin action writes to audit_log.

## UX
- Mobile-first, works on low-end Android over 3G; min tap target 48px.
- Format FCFA as "150 000 FCFA". All UI text comes from fr.json / en.json.
- Brand: indigo #1F2A5A, saffron #F2A93B, off-white #FAF7F2, font Inter.

## Working rules
- Plan before coding; keep changes small; write tests for all money logic.
- After each task: run typecheck, lint and tests, fix failures, then commit with a clear message.
- Ask me before adding a paid service or changing a money rule.

## Project notes (added during phases 1–3)
- Money code lives in supabase/migrations/*_ledger_core.sql (post_ledger_transaction, create_payment, settle_payment, reconcile_payment). Server code calls it through the Db interface in src/server/db.ts.
- SQL is tested with PGlite (Postgres in WASM) via supabase/tests/harness.ts — `npm test` needs no Docker or Supabase project.
- src/types/database.ts is generated: `npm run db:types` (from migrations) or `npm run db:types:remote` (from the linked Supabase project).
- Sandbox test wallet numbers: ending 9990 = success, 9991 = pending then success, 9992 = failure.
