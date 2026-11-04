# Security review (Phase 14, November 2026)

Scope: the whole codebase and every migration: row-level security, service-role key exposure,
webhook signatures, idempotency, money logic outside the database, file uploads and rate limits.
The database checks are now enforced by `supabase/tests/security.test.ts`.

## Fixed

| # | Finding | Fix |
| - | --- | --- |
| 1 | Any signed-in user could read approved payees' `payout_account_token` and `reviewed_by` (table-wide SELECT). | Column-level SELECT on `payees`; token and reviewer are server-only. |
| 2 | `sanctions_status` was readable by the person themselves and by fellow tontine members: telling someone they are under sanctions review is "tipping off". | Column-level SELECT on `profiles` and `payees` without the flag; staff read flags through `admin_sanctions_flags()`. |
| 3 | No rate limits on user actions. | Postgres fixed-window limiter (`hit_rate_limit`, no paid service): 20 payments / 10 min, 20 invite joins / hour, 10 KYC submissions / day, 10 account links / hour, 60 USSD steps / 10 min per user. |
| 4 | Trigger-only functions (`handle_new_user`, `forbid_mutation`…) were executable through the API. | `EXECUTE` revoked from `anon` and `authenticated`. |
| 5 | No browser security headers. | `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS. |
| 6 | The payment screen promises test card 4242 is accepted, but the sandbox failed it 3% of the time. | 4242 is a fixed "success" test account. |
| 7 | A Payer pour test failed ~3% of runs for the same reason. | Tests use the fixed 9990 card. |

## Checked and fine

- **RLS** on all 30 public tables; signed-out visitors have no table access and can call only
  `directed_payment_public` (needs a 24+ character share token), `kyc_daily_limit_xof` and `xof_equivalent`.
- **Every SECURITY DEFINER function** pins `search_path`. The ones without `auth.uid()` check access
  through `is_group_member`, `owns_payee`, `can_see_ledger_account` or `is_staff`.
- **Service-role key**: only in `src/lib/supabase/admin.ts` (`server-only` import); no client component
  imports it; no secret uses a `NEXT_PUBLIC_` name.
- **Webhooks**: HMAC-SHA256 over the raw body, constant-time compare, 5-minute timestamp window;
  settlement is idempotent, so a replay inside the window changes nothing.
- **Idempotency**: every `PaymentService.initiate` call has a deterministic key (contribution id,
  directed payment id, cycle and attempt, client request key).
- **Money logic** lives in Postgres functions; TypeScript only formats amounts and draws progress bars.
- **Uploads**: private buckets, 5 MB, JPEG/PNG/WebP/PDF only, users can only write their own folder,
  and KYC records must point inside it. ID numbers are stored as a peppered hash plus the last 4 characters.
- **Cron routes**: bearer secret with constant-time compare; `?date=` simulation is ignored in production.
- **Sign-in redirect** (`next`) only accepts same-site paths.
- **Invite codes**: 48 random bits.

## Needs a human decision

1. **Phone numbers inside a tontine.** Members can read each other's phone number (it helps the
   manager chase payments). Keep, or show it to the manager only?
2. **Lottery payout order** uses Postgres `random()`, which is not cryptographically secure. Switching to
   `gen_random_uuid()` ordering changes a payout rule, so it needs your approval.
3. **Admin accounts** sign in with phone OTP only. Turn on Supabase MFA for staff before real users.
4. **Uploads** are checked by declared type and size, not by content. Add malware scanning and
   magic-byte checks (or a KYC provider) before real documents.
5. **Full Content-Security-Policy for scripts** needs per-request nonces (every page rendered
   dynamically). Worth doing before launch; small performance cost.
6. **Real OTP SMS** needs a paid provider and Supabase's own rate limits/captcha settings reviewed.
7. **Independent penetration test** before real money or real ID documents.
