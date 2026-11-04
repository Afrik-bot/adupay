# AduPay Connect: top-ups and "Data offerte"

AduPay Connect step 1 lets people buy airtime and data bundles on Orange CI, MTN CI and Moov Africa CI,
and rewards on-time tontine payments with free data ("Data offerte"). Nothing real is bought: every
delivery goes through `AirtimeProvider`, implemented by `SandboxAirtimeProvider` until a licensed
distributor is signed (`AIRTIME_PROVIDER=sandbox`).

## Top-ups ("Crédit & Data")

- **Who**: "Pour moi" (the user's own Ivorian number) or "Pour un proche" (a saved number or a new one).
  The network is suggested from the prefix (07 Orange, 05 MTN, 01 Moov) and can be changed: numbers can be ported.
- **What**: an airtime amount or a data bundle from `airtime_products`. Prices are **sample prices**,
  editable by admins (Admin → Connect → Catalogue). The AduPay fee on a top-up is **0 FCFA**.
- **How to pay**:
  - AduPay balance: debited at once, in the same transaction that records the top-up;
  - Mobile Money (the default linked account): collected first, then spent;
  - card in EUR, USD or CAD, for diaspora users: the FCFA price converted at the FX table's customer rate.
- **Limits**: KYC tier limits apply, enforced in the database (`create_topup`, and `create_payment` for
  mobile money and card). Balance top-ups count toward the daily limit.
- **After paying**: a receipt with a status timeline (Payé → Envoyé à l'opérateur → Reçu), "Répéter", and
  "Enregistrer le numéro" (favourites in `saved_numbers`).
- **Payer pour** has a "Data & crédit" choice that opens the same flow for a relative.
- **Delivery**: queued top-ups are claimed by one dispatcher at a time (`claim_topups`, SKIP LOCKED) and sent
  with a key unique to the attempt. A failed delivery is retried (after 2, then 4 minutes) up to 3 attempts;
  a retry only follows a definite failure, so a top-up is never delivered twice. After the last failure the money
  goes back to the buyer's AduPay balance. Missed webhooks are caught by the daily reconcile job.

## Data offerte rewards

| Trigger | When | Who gets it | Event key (granted once) |
| --- | --- | --- | --- |
| `on_time_contribution` | a contribution is paid on or before the round's due date | the member whose share it is | `contribution:<id>` |
| `manager_member_on_time` | a member (not the manager) pays on time | the group's manager | `manager:<contribution id>` |
| `clean_cycle` | a round is paid out and every member paid on time | every member of the rotation | `cycle:<cycle id>:<member id>` |

- Late contributions earn nothing. "On time" uses Abidjan time (UTC): paid on or before the due date.
- Each rule gives one **data bundle** (`reward_rules.product_id`). The member receives the bundle of the same
  volume on **their own network**, worked out from the number on their profile.
- `reward_grants` has `UNIQUE (rule_id, source_event_id)`: a retried job, a replayed webhook or a cycle
  reopened and closed again can never grant twice.
- **Caps**: a per-member monthly cap (`reward_settings.per_user_monthly_cap_xof`) and a monthly budget
  (`reward_budgets`, created from `default_monthly_budget_xof` on the first grant of the month). When a grant
  would pass either one it is recorded as `skipped` with the reason (`user_cap`, `budget`), so every decision is logged.
  Members without an Ivorian number are skipped with `no_number`; a disabled rule with `rule_off`.
- **Defaults (sample, to be decided)**: on-time and clean-cycle rewards are 500 Mo (500 FCFA); the manager reward is
  150 Mo (200 FCFA); cap 2 000 FCFA per member per month; budget 250 000 FCFA per month.
- **Delivery**: each grant creates a data top-up to the member's own number with the key `reward:<grant id>`
  (plus the attempt). If it finally fails, the cost goes back to the budget and the grant is marked `failed`.
- **Message** (French/English, volume from the product): "Bravo ! Vous avez gagné 500 Mo pour votre cotisation à l'heure."

## Ledger (XOF, integers)

| Event | Debit | Credit |
| --- | --- | --- |
| Top-up from the AduPay balance | user wallet | `provider_settlement` |
| Top-up by Mobile Money | rail → user wallet (collect), then user wallet | `provider_settlement` |
| Top-up by card | `fx_clearing:EUR` / `partner_settlement:XOF` | `partner_settlement:EUR` / `provider_settlement` |
| Reward granted | `rewards_expense` | `provider_settlement` |
| Paid top-up not delivered | `provider_settlement` | user wallet (refund) |
| Reward not delivered | `provider_settlement` | `rewards_expense` |

`provider_settlement` is what AduPay owes the distributor; it is settled with the licensed partner outside the app.
Every movement is a balanced double-entry transaction posted inside the Postgres function that records it.

## Admin and risk

- Admin → Connect: reward rule per trigger (bundle, on/off), monthly budget and per-member cap, budget burn by day,
  catalogue prices, and top-up monitoring filtered by status, source and network. Every change writes to `audit_log`.
- Risk rules (cases in Admin → Risques): one user topping up more than 10 different numbers in 24 h
  (`topup_many_numbers`); 3 or more failed top-ups in 24 h (`topup_failures`); a reward for an account opened the
  same day as the tontine (`reward_new_account`; the reward is still granted, the case is for review).

## Tests

`src/server/connect.test.ts` (database rules, ledger, retries), `src/server/airtime/sandbox.test.ts`,
`src/lib/airtime.test.ts`, and the Playwright journeys `e2e/02-tontine.spec.ts` (reward notification) and
`e2e/04-connect.spec.ts`.
