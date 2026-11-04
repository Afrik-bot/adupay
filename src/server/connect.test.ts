// AduPay Connect through the real migrations (PGlite): top-ups paid from the
// balance, mobile money and card; Data offerte rewards; delivery retries; the ledger.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db";
import { DEMO, TestDb } from "../../supabase/tests/harness";
import { deliverTopups } from "./airtime/deliver";
import { SandboxAirtimeProvider } from "./airtime/sandbox";
import { SandboxProvider } from "./payments/sandbox";
import { PaymentService } from "./payments/service";
import { startTopup } from "./topups";

const SECRET = "test-secret-at-least-16";
let db: TestDb;
let svc: Db;
let now = Date.now();
const timers: { at: number; fn: () => void }[] = [];
const payHooks: { body: string; headers: Record<string, string> }[] = [];
const airHooks: { body: string; headers: Record<string, string> }[] = [];
let service: PaymentService;
let airtime: SandboxAirtimeProvider;
const purchases: string[] = [];

/** Lets both sandboxes answer, delivers their signed webhooks, then sends what got queued. */
async function settle(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    now += 20_000;
    for (const t of timers.filter((t) => t.at <= now)) {
      timers.splice(timers.indexOf(t), 1);
      t.fn();
    }
    for (const w of payHooks.splice(0)) await service.handleWebhook(w.body, new Headers(w.headers));
    for (const w of airHooks.splice(0)) {
      const event = await airtime.handleWebhook(w.body, new Headers(w.headers));
      await svc.rpc("complete_topup", { p_provider_ref: event.providerRef, p_status: event.status, p_failure_code: event.failureCode ?? null });
    }
    await deliverTopups(svc, airtime);
  }
}

const product = (id: string) => db.one<{ id: string; price_xof: number; data_mb: number | null }>("select id, price_xof, data_mb from public.airtime_products where provider_product_id = $1", [id]);
const topup = (id: string) => db.one<{ status: string; attempts: number; failure_code: string | null; source_amount: number }>("select * from public.topups where id = $1", [id]);
const balance = (code: string) => db.one<{ b: number }>("select coalesce(public.account_balance(id), 0) as b from public.ledger_accounts where code = $1", [code]);
const grants = (user: string, rule?: string) =>
  db.all<{ rule_id: string; status: string; skip_reason: string | null; cost_xof: number; topup_id: string | null }>(
    `select rule_id, status, skip_reason, cost_xof, topup_id from public.reward_grants where user_id = $1 ${rule ? "and rule_id = $2" : ""} order by created_at`,
    rule ? [user, rule] : [user],
  );

async function fundWallet(user: string, amount: number) {
  const wallet = await svc.rpc<string>("ensure_ledger_account", { p_owner_type: "user", p_owner_id: user, p_currency: "XOF" });
  const p = await svc.rpc<{ id: string }>("create_payment", {
    p_idempotency_key: randomUUID(), p_user_id: user, p_direction: "collect", p_provider: "sandbox", p_amount: amount, p_currency: "XOF", p_ledger_account_id: wallet,
  });
  await svc.rpc("settle_payment", { p_payment_id: p.id, p_status: "succeeded" });
}

beforeAll(async () => {
  db = await TestDb.create();
  svc = db.serviceDb();
  const schedule = (fn: () => void, ms: number) => void timers.push({ at: now + ms, fn });
  service = new PaymentService(svc, new SandboxProvider({ secret: SECRET, now: () => now, schedule, deliver: async (body, headers) => void payHooks.push({ body, headers }) }));
  airtime = new SandboxAirtimeProvider({ secret: SECRET, now: () => now, schedule, deliver: async (body, headers) => void airHooks.push({ body, headers }) });
  const purchase = airtime.purchase.bind(airtime);
  airtime.purchase = async (request) => {
    purchases.push(`${request.msisdn}|${request.idempotencyKey}`);
    return purchase(request);
  };
  await db.pg.query("update public.profiles set kyc_tier = 2");
  // Members' own numbers: …9990 always receives its reward (sandbox).
  await db.pg.query("update public.profiles set phone = '2250700009990' where id = $1", [DEMO.awa]);
  await db.pg.query("update public.profiles set phone = '2250500009990' where id = $1", [DEMO.koffi]);
}, 120_000);

afterAll(() => db?.close());

describe("top-ups", () => {
  it("from the AduPay balance: debits the wallet at once, then delivers", async () => {
    await fundWallet(DEMO.koffi, 3_000);
    const data = await product("orange-data-500");
    const result = await startTopup(svc, service, {
      buyerId: DEMO.koffi, requestKey: randomUUID(), msisdn: "+225 07 11 22 99 90", beneficiaryName: "Maman",
      operator: "orange", productId: data.id, payWith: "balance", currency: "XOF",
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.topup.status).toBe("queued");
    expect((await balance(`user:${DEMO.koffi}:XOF`)).b).toBe(2_500);
    await settle();
    expect((await topup(result.topup.id)).status).toBe("succeeded");
    const note = await db.one<{ template: string }>("select template from public.notifications where dedupe_key = $1", [`topup:${result.topup.id}`]);
    expect(note.template).toBe("topup_delivered");
  });

  it("refuses when the balance is too low, and the same request key never buys twice", async () => {
    const big = await product("orange-data-5000");
    expect(await startTopup(svc, service, { buyerId: DEMO.koffi, requestKey: randomUUID(), msisdn: "2250711229990", beneficiaryName: null, operator: "orange", productId: big.id, payWith: "balance", currency: "XOF" })).toEqual({ error: "insufficient" });
    const small = await product("mtn-airtime-500");
    const key = randomUUID();
    const input = { buyerId: DEMO.koffi, requestKey: key, msisdn: "2250511229990", beneficiaryName: null, operator: "mtn" as const, productId: small.id, payWith: "balance" as const, currency: "XOF" as const };
    const a = await startTopup(svc, service, input);
    const b = await startTopup(svc, service, input);
    expect("topup" in a && "topup" in b && a.topup.id === b.topup.id).toBe(true);
    expect((await balance(`user:${DEMO.koffi}:XOF`)).b).toBe(2_000);
    await settle();
  });

  it("by mobile money: the collect settles, then the bundle is delivered", async () => {
    const data = await product("moov-data-150");
    const result = await startTopup(svc, service, {
      buyerId: DEMO.awa, requestKey: randomUUID(), msisdn: "2250111229990", beneficiaryName: "Petit frère",
      operator: "moov", productId: data.id, payWith: "mobile_money", currency: "XOF", account: { provider: "wave", ref: "sbxacct_test_9990" },
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.topup.status).toBe("awaiting_payment");
    await settle();
    expect((await topup(result.topup.id)).status).toBe("succeeded");
    expect((await balance(`user:${DEMO.awa}:XOF`)).b).toBe(0); // paid in, then spent
  });

  it("by card from abroad: charged in EUR at the FX table rate, no AduPay fee", async () => {
    const data = await product("orange-data-1500");
    const result = await startTopup(svc, service, {
      buyerId: DEMO.aminata, requestKey: randomUUID(), msisdn: "2250722339990", beneficiaryName: "Fatou",
      operator: "orange", productId: data.id, payWith: "card", currency: "EUR", account: { provider: "card", ref: "sbxcard_test_4242" },
    });
    if ("error" in result) throw new Error(result.error);
    const quote = await db.one<{ base_amount: number }>("select base_amount from public.fx_quote(2000, 'EUR')");
    expect(result.topup.source_amount).toBe(quote.base_amount);
    await settle();
    expect((await topup(result.topup.id)).status).toBe("succeeded");
    expect((await balance("system:fx_clearing:EUR")).b).toBe(0);
  });

  it("a failed delivery retries with a new key each time, then refunds once; never delivered twice", async () => {
    await fundWallet(DEMO.koffi, 1_000);
    const before = (await balance(`user:${DEMO.koffi}:XOF`)).b;
    const airtimeProduct = await product("orange-airtime-500");
    const result = await startTopup(svc, service, {
      buyerId: DEMO.koffi, requestKey: randomUUID(), msisdn: "2250733449992", beneficiaryName: null,
      operator: "orange", productId: airtimeProduct.id, payWith: "balance", currency: "XOF",
    });
    if ("error" in result) throw new Error(result.error);
    for (let attempt = 1; attempt <= 3; attempt++) {
      await db.pg.query("update public.topups set claimed_at = now() - interval '1 hour' where id = $1", [result.topup.id]);
      await settle(1);
      await settle(1);
    }
    const final = await topup(result.topup.id);
    expect(final).toMatchObject({ status: "failed", attempts: 3 });
    const keys = purchases.filter((k) => k.startsWith("2250733449992|"));
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3); // every attempt had its own key
    expect((await balance(`user:${DEMO.koffi}:XOF`)).b).toBe(before); // refunded exactly once
    await settle(2);
    expect((await balance(`user:${DEMO.koffi}:XOF`)).b).toBe(before);
  });

  it("KYC limits apply to balance top-ups", async () => {
    await db.pg.query("update public.profiles set kyc_tier = 0 where id = $1", [DEMO.koffi]);
    const p = await product("mtn-airtime-500");
    const r = await startTopup(svc, service, { buyerId: DEMO.koffi, requestKey: randomUUID(), msisdn: "2250511229990", beneficiaryName: null, operator: "mtn", productId: p.id, payWith: "balance", currency: "XOF" });
    expect(r).toEqual({ error: "kycRequired" });
    await db.pg.query("update public.profiles set kyc_tier = 2 where id = $1", [DEMO.koffi]);
  });
});

describe("Data offerte rewards", () => {
  let cycleId: string;

  beforeAll(async () => {
    cycleId = (await db.one<{ id: string }>("select id from public.cycles where group_id = $1 and number = 1", [DEMO.adjameGroup])).id;
  });

  const pay = async (member: string) => {
    const c = await svc.rpc<{ id: string }>("create_contribution", { p_cycle_id: cycleId, p_member_id: member, p_paid_by: member });
    await db.pg.query("update public.contributions set status = 'succeeded' where id = $1", [c.id]);
    return c.id;
  };

  it("an on-time share grants exactly one reward to the member, and one to the manager", async () => {
    const id = await pay(DEMO.koffi);
    await db.pg.query("update public.contributions set status = 'succeeded' where id = $1", [id]); // retried job
    await svc.rpc("grant_reward", { p_rule: "on_time_contribution", p_user_id: DEMO.koffi, p_source_event_id: `contribution:${id}`, p_group_id: DEMO.adjameGroup });
    const mine = await grants(DEMO.koffi, "on_time_contribution");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ status: "granted", cost_xof: 500 }); // 500 Mo on his own network (MTN)
    expect(await grants(DEMO.awa, "manager_member_on_time")).toHaveLength(1);
    expect((await db.one<{ operator: string }>("select operator from public.topups where id = $1", [mine[0].topup_id])).operator).toBe("mtn");
  });

  it("the reward is delivered as data and the member is told in their language", async () => {
    await settle();
    const [g] = await grants(DEMO.koffi, "on_time_contribution");
    expect(g.status).toBe("delivered");
    const note = await db.one<{ template: string; payload: { data_mb: number } }>(
      "select template, payload from public.notifications where user_id = $1 and template like 'reward_%' order by created_at desc limit 1",
      [DEMO.koffi],
    );
    expect(note).toMatchObject({ template: "reward_on_time_contribution", payload: { data_mb: 500 } });
  });

  it("the manager's own share earns the on-time reward but no manager reward", async () => {
    await pay(DEMO.awa);
    expect(await grants(DEMO.awa, "on_time_contribution")).toHaveLength(1);
    expect(await grants(DEMO.awa, "manager_member_on_time")).toHaveLength(1); // only Koffi's
  });

  it("a round paid out with everyone on time grants the clean-cycle reward to every member", async () => {
    await db.pg.query("update public.cycles set status = 'paid_out' where id = $1", [cycleId]);
    expect(await grants(DEMO.awa, "clean_cycle")).toHaveLength(1);
    expect(await grants(DEMO.koffi, "clean_cycle")).toHaveLength(1);
    await db.pg.query("update public.cycles set status = 'collecting' where id = $1", [cycleId]);
    await db.pg.query("update public.cycles set status = 'paid_out' where id = $1", [cycleId]);
    expect(await grants(DEMO.koffi, "clean_cycle")).toHaveLength(1); // once per event
  });

  it("late shares earn nothing, and a round with a late share has no clean-cycle reward", async () => {
    const late = await db.one<{ id: string }>(
      `insert into public.cycles (group_id, number, due_date, recipient_id, status) values ($1, 2, current_date - 1, $2, 'collecting') returning id`,
      [DEMO.adjameGroup, DEMO.koffi],
    );
    const before = (await grants(DEMO.koffi)).length;
    const c = await svc.rpc<{ id: string }>("create_contribution", { p_cycle_id: late.id, p_member_id: DEMO.koffi, p_paid_by: DEMO.koffi });
    await db.pg.query("update public.contributions set status = 'succeeded' where id = $1", [c.id]);
    const c2 = await svc.rpc<{ id: string }>("create_contribution", { p_cycle_id: late.id, p_member_id: DEMO.awa, p_paid_by: DEMO.awa });
    await db.pg.query("update public.contributions set status = 'succeeded' where id = $1", [c2.id]);
    await db.pg.query("update public.cycles set status = 'paid_out' where id = $1", [late.id]);
    expect((await grants(DEMO.koffi)).length).toBe(before);
  });

  it("the per-user cap and the monthly budget stop grants, and the skip is logged", async () => {
    await db.pg.query("update public.reward_settings set per_user_monthly_cap_xof = 0");
    await svc.rpc("grant_reward", { p_rule: "on_time_contribution", p_user_id: DEMO.koffi, p_source_event_id: "test:cap", p_group_id: DEMO.adjameGroup });
    expect((await grants(DEMO.koffi)).at(-1)).toMatchObject({ status: "skipped", skip_reason: "user_cap", cost_xof: 0 });
    await db.pg.query("update public.reward_settings set per_user_monthly_cap_xof = 100000");
    await db.pg.query("update public.reward_budgets set budget_xof = spent_xof");
    await svc.rpc("grant_reward", { p_rule: "on_time_contribution", p_user_id: DEMO.koffi, p_source_event_id: "test:budget", p_group_id: DEMO.adjameGroup });
    expect((await grants(DEMO.koffi)).at(-1)).toMatchObject({ status: "skipped", skip_reason: "budget" });
    await db.pg.query("update public.reward_budgets set budget_xof = 250000");
  });

  it("members without an Ivorian number are skipped, not charged", async () => {
    await svc.rpc("grant_reward", { p_rule: "on_time_contribution", p_user_id: DEMO.aminata, p_source_event_id: "test:abroad", p_group_id: DEMO.adjameGroup });
    expect((await grants(DEMO.aminata)).at(-1)).toMatchObject({ status: "skipped", skip_reason: "no_number" });
  });

  it("a reward that cannot be delivered goes back to the budget", async () => {
    await db.pg.query("update public.profiles set phone = '2250500009992' where id = $1", [DEMO.koffi]);
    const g = await svc.rpc<{ id: string; topup_id: string; cost_xof: number }>("grant_reward", { p_rule: "on_time_contribution", p_user_id: DEMO.koffi, p_source_event_id: "test:fails", p_group_id: DEMO.adjameGroup });
    const spent = (await db.one<{ spent_xof: number }>("select spent_xof from public.reward_budgets")).spent_xof;
    for (let i = 0; i < 3; i++) {
      await db.pg.query("update public.topups set claimed_at = now() - interval '1 hour' where id = $1", [g.topup_id]);
      await settle(2);
    }
    expect((await topup(g.topup_id)).status).toBe("failed");
    expect((await db.one<{ status: string }>("select status from public.reward_grants where id = $1", [g.id])).status).toBe("failed");
    expect((await db.one<{ spent_xof: number }>("select spent_xof from public.reward_budgets")).spent_xof).toBe(spent - g.cost_xof);
    await db.pg.query("update public.profiles set phone = '2250500009990' where id = $1", [DEMO.koffi]);
  });
});

describe("ledger and risk", () => {
  it("every top-up and reward leaves the ledger balanced", async () => {
    const unbalanced = await db.all(
      `select t.id from public.ledger_transactions t join public.ledger_entries e on e.transaction_id = t.id
        group by t.id, e.currency having sum(case when e.side = 'debit' then e.amount else -e.amount end) <> 0`,
    );
    expect(unbalanced).toEqual([]);
    // What AduPay owes the distributor = everything delivered.
    const delivered = await db.one<{ s: number }>("select coalesce(sum(amount_xof), 0)::int as s from public.topups where status = 'succeeded'");
    const pendingOrQueued = await db.one<{ s: number }>("select coalesce(sum(amount_xof), 0)::int as s from public.topups where status in ('queued', 'sending', 'pending')");
    expect((await balance("system:provider_settlement:XOF")).b).toBe(delivered.s + pendingOrQueued.s);
    // Rewards expense = delivered or in-flight rewards.
    const rewards = await db.one<{ s: number }>("select coalesce(sum(cost_xof), 0)::int as s from public.reward_grants where status in ('granted', 'delivered')");
    expect((await balance("system:rewards_expense:XOF")).b).toBe(rewards.s);
  });

  it("topping up more than 10 different numbers in 24 h opens a case", async () => {
    await fundWallet(DEMO.awa, 20_000);
    const p = await product("orange-airtime-500");
    for (let i = 0; i < 11; i++) {
      await startTopup(svc, service, { buyerId: DEMO.awa, requestKey: randomUUID(), msisdn: `2250700${String(10 + i)}9990`, beneficiaryName: null, operator: "orange", productId: p.id, payWith: "balance", currency: "XOF" });
    }
    const cases = await db.all("select id from public.risk_events where kind = 'topup_many_numbers' and subject_user_id = $1", [DEMO.awa]);
    expect(cases).toHaveLength(1);
  });

  it("signed-in users cannot buy, claim or grant through the API", async () => {
    for (const fn of ["create_topup", "claim_topups", "complete_topup", "grant_reward", "mark_topup_sent"]) {
      const ok = await db.one<{ ok: boolean }>(
        `select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) as ok from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`,
        [fn],
      );
      expect(ok.ok, fn).toBe(false);
    }
    const others = await db.asUser(DEMO.aminata, async (q) => (await q.query("select id from public.topups where buyer_id = $1", [DEMO.koffi])).rows);
    expect(others).toEqual([]);
  });
});
