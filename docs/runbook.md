# AduPay runbook: deploy and roll back

AduPay runs as a Next.js app on **Vercel** and a **Supabase** project (Postgres, Auth, Storage).
Every money movement goes through `SandboxProvider` until licensed partners are signed. Do not
point this deployment at real money, real ID documents or real SMS until the items under
"Before real users" are done.

All commands are PowerShell, from the project folder:

```powershell
cd C:\Users\johnn\AduPay\adupay
```

## 1. Before every deploy

1. Check that `main` is green on your machine:
   ```powershell
   npm run typecheck; npm run lint; npm test
   ```
2. Take a database backup (free plan has no point-in-time restore):
   ```powershell
   npx supabase db dump --remote -f "backups\$(Get-Date -Format yyyyMMdd-HHmm).sql"
   npx supabase db dump --remote --data-only -f "backups\$(Get-Date -Format yyyyMMdd-HHmm)-data.sql"
   ```
   `backups\` is git-ignored. Keep the files somewhere safe; they contain personal data.
3. See which migrations the live database does not have yet:
   ```powershell
   npx supabase migration list --linked
   ```

## 2. Database (Supabase)

1. Apply new migrations. They are forward-only and run in one transaction each:
   ```powershell
   npx supabase db push --linked
   ```
2. Regenerate types and commit if they changed:
   ```powershell
   npm run db:types:remote
   ```
3. Auth settings (Dashboard → Authentication):
   - **URL Configuration → Site URL**: the Vercel production URL (e.g. `https://adupay.vercel.app`).
     Add it and any preview URL pattern to **Redirect URLs**.
   - **Providers → Phone**: enabled. Test numbers work without an SMS provider. Real users need
     an SMS provider (paid, see "Before real users").
   - **Rate limits**: keep the defaults or lower "SMS sent per hour".
4. Storage buckets `kyc-documents` and `kyb-documents` are created by the migrations as **private**
   with a 5 MB limit. Check they are not public (Dashboard → Storage).

## 3. App (Vercel)

First time only:

1. vercel.com → **Add New… → Project** → import `Afrik-bot/adupay` from GitHub.
2. Framework: Next.js (detected). Build command and output: defaults.
3. **Environment Variables** (Production and Preview). Values come from `.env.local` or the
   Supabase dashboard (Project Settings → API). Never paste them in chat or commit them.

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service role key (server only) |
   | `APP_URL` | the production URL, e.g. `https://adupay.vercel.app` (webhooks call it) |
   | `PAYMENT_PROVIDER` | `sandbox` |
   | `NOTIFICATION_PROVIDER` | `simulated` |
   | `AIRTIME_PROVIDER` | `sandbox` |
   | `SANDBOX_WEBHOOK_SECRET` | a **new** random 32-character string for production |
   | `CRON_SECRET` | a **new** random 32-character string |
   | `KYC_ID_PEPPER` | random 32+ characters. **Never change it once real documents exist.** |

   Random value in PowerShell: `-join ((48..57) + (97..122) | Get-Random -Count 32 | % {[char]$_})`
4. **Deploy**. Vercel reads `vercel.json` and schedules the two daily crons
   (reconcile 05:00 UTC, tontines 06:00 UTC = Abidjan time).

Every later deploy: push to `main`. Vercel builds and promotes it automatically.

## 4. Smoke test after a deploy (5 minutes)

1. Open the production URL: the landing page loads in French; "en" switches to English.
2. Sign in with a test phone number, open Accueil, Tontines, Payer pour, Épargne, Profil.
3. Open `/notifications` and `/ussd`, dial `*123#`, choose 1 (Solde).
4. As an admin, open `/admin`, enter your authenticator code (first time: set the app up there): KPI tiles load.
   In Supabase → Authentication → Multi-Factor, TOTP must stay enabled (it is by default).
5. Vercel → Project → **Cron Jobs**: both jobs listed. Run "tontines" once by hand and check
   the response is `"ok": true` (Vercel → Logs).
6. Vercel → Logs: no new errors.

## 5. Roll back

**App only (code bug):** Vercel → Project → Deployments → pick the last good deployment →
**⋯ → Promote to Production** (instant, no rebuild). Then `git revert` the bad commit on `main`
so the next push does not bring it back.

**Database (bad migration):** migrations cannot be "un-pushed".
1. Stop the damage first: promote the previous app deployment (above) if the new code depends on it.
2. Write a new migration that undoes the change (drop the new function, restore the old
   definition from the previous migration file, etc.) and `npx supabase db push --linked`.
3. Only if data was destroyed: restore from the backup taken in step 1.2, into a **new**
   Supabase project first to check it, then into production
   (`psql "<connection string>" -f backups\<file>.sql`). Ledger rows are append-only. Never
   edit them by hand. Fix balances with a new correcting transaction.

## 6. Before real users (needs a human decision)

- A BCEAO-licensed partner (EME or bank) and a real `PaymentProvider` class. Until then,
  `PAYMENT_PROVIDER=sandbox` must stay.
- An SMS provider for real phone OTP (Twilio, Africa's Talking, etc.: paid), and a real
  WhatsApp/SMS `NotificationProvider`.
- A real KYC provider (e.g. Smile ID) instead of manual document review; malware scanning of uploads.
- An independent security review and penetration test, plus a data-protection filing with the
  ARTCI (Côte d'Ivoire) before real ID documents are stored.
- Supabase Pro (daily backups, point-in-time recovery) and a custom domain with HTTPS.
