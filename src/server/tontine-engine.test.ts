// A full 3-round tontine through the real migrations (PGlite), the sandbox rail
// with signed webhooks, and the daily engine, on a simulated calendar.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO, TestDb } from "../../supabase/tests/harness";
import { SandboxProvider } from "./payments/sandbox";
import { PaymentService } from "./payments/service";
import { runTontineEngine } from "./tontine-engine";

const SECRET = "test-secret-at-least-16";
let db: TestDb;
let now = Date.now();
const timers: { at: number; fn: () => void }[] = [];
const webhooks: { body: string; headers: Record<string, string> }[] = [];
let provider: SandboxProvider;
let service: PaymentService;

/** Lets the sandbox rail answer, then delivers its signed webhooks. */
async function railSettles() {
  now += 20_000;
  for (const t of timers.filter((t) => t.at <= now)) {
    timers.splice(timers.indexOf(t), 1);
    t.fn();
  }
  for (const w of webhooks.splice(0)) await service.handleWebhook(w.body, new Headers(w.headers));
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));

async function newUser(name: string) {
  const id = randomUUID();
  await db.pg.query("insert into auth.users (id, phone, raw_user_meta_data) values ($1, $2, $3)", [
    id,
    `2250${Math.floor(100_000_000 + Math.random() * 899_999_999)}`,
    JSON.stringify({ full_name: name }),
  ]);
  return id;
}

async function linkWallet(user: string, last4 = "9990") {
  await db.pg.query("update public.linked_accounts set is_default = false where user_id = $1", [user]);
  await db.pg.query(
    `insert into public.linked_accounts (user_id, provider, account_masked, account_ref_hash, is_default, verified_at, account_token)
     values ($1, 'wave', $2, $3, true, now(), $4)`,
    [user, `•••• ${last4}`, randomUUID(), `sbxacct_test_${last4}`],
  );
}

/** What "Payer ma part" does server-side, for a given member. */
async function pay(user: string, groupId: string) {
  const svc = db.serviceDb();
  const cycle = await db.one<{ id: string }>(
    "select id from public.cycles where group_id = $1 and status in ('open','collecting') order by number desc limit 1",
    [groupId],
  );
  const c = await svc.rpc<{ id: string; amount: number }>("create_contribution", {
    p_cycle_id: cycle.id,
    p_member_id: user,
    p_paid_by: user,
  });
  const pot = await svc.rpc<string>("ensure_ledger_account", { p_owner_type: "group", p_owner_id: groupId, p_currency: "XOF" });
  const token = await db.one<{ account_token: string }>("select account_token from public.linked_accounts where user_id = $1 and is_default", [user]);
  await service.initiate({
    idempotencyKey: `contribution:${c.id}`,
    userId: user,
    direction: "collect",
    amount: c.amount,
    currency: "XOF",
    ledgerAccountId: pot,
    account: { provider: "wave", ref: token.account_token },
    purposeType: "contribution",
    purposeId: c.id,
  });
  return c.amount;
}

const engine = (today: string) => runTontineEngine(db.serviceDb(), service, today);
const balance = (accountId: string) => db.serviceDb().rpc<number>("account_balance", { p_account_id: accountId });
const asUser = <T>(user: string, sql: string, params: unknown[] = []) =>
  db.asUser(user, async (q) => (await q.query<T>(sql, params)).rows);

beforeAll(async () => {
  db = await TestDb.create();
  // Only the tontines created here should be in play for the engine.
  await db.pg.query("update public.groups set status = 'cancelled' where id = $1", [DEMO.adjameGroup]);
  provider = new SandboxProvider({
    secret: SECRET,
    now: () => now,
    schedule: (fn, ms) => void timers.push({ at: now + ms, fn }),
    deliver: async (body, headers) => void webhooks.push({ body, headers }),
  });
  service = new PaymentService(db.serviceDb(), provider);
}, 120_000);

afterAll(() => db?.close());

describe("a full 3-round tontine", () => {
  let groupId: string;
  let bintou: string;
  let due1: string;

  beforeAll(async () => {
    bintou = await newUser("Bintou Diallo");
    await db.pg.query("update public.profiles set kyc_tier = 2 where id = any($1)", [[DEMO.awa, DEMO.koffi, bintou]]);
    for (const u of [DEMO.awa, DEMO.koffi, bintou]) await linkWallet(u);

    groupId = (
      await asUser<{ v: string }>(
        DEMO.awa,
        "select public.create_group('Tontine 3 tours', 10000, 'weekly', current_date, 3, 'fixed', 2, 500) as v",
      )
    )[0].v;
    const code = (await db.one<{ invite_code: string }>("select invite_code from public.groups where id = $1", [groupId])).invite_code;
    await asUser(DEMO.koffi, "select public.join_group($1)", [code]);
    await asUser(bintou, "select public.join_group($1)", [code]);
    await asUser(DEMO.awa, "select public.start_group($1)", [groupId]);
    due1 = iso((await db.one<{ due_date: string }>("select due_date from public.cycles where group_id = $1", [groupId])).due_date);
  });

  it("round 1: reminders the day before, everyone pays, the pot goes out early", async () => {
    const r = await engine(addDays(due1, -1));
    expect(r.waiting).toBe(1);
    const reminders = () => db.all("select * from public.notifications where template = 'contribution_due' and payload->>'group_id' = $1", [groupId]);
    expect(await reminders()).toHaveLength(3);
    await engine(addDays(due1, -1));
    expect(await reminders()).toHaveLength(3); // idempotent

    for (const u of [DEMO.awa, DEMO.koffi, bintou]) await pay(u, groupId);
    await railSettles();

    const out = await engine(addDays(due1, -1));
    expect(out.paidOut).toBe(1);
    await railSettles();

    const payout = await db.one<{ amount: number; status: string; recipient_id: string }>(
      "select p.amount, p.status, p.recipient_id from public.payouts p join public.cycles c on c.id = p.cycle_id where c.group_id = $1 and c.number = 1",
      [groupId],
    );
    expect(payout).toEqual({ amount: 30_000, status: "succeeded", recipient_id: DEMO.awa });

    // Running again the same day does nothing more.
    const paymentsBefore = await db.one<{ n: number }>("select count(*)::int as n from public.payments");
    expect((await engine(addDays(due1, -1))).paidOut).toBe(0);
    expect(await db.one("select count(*)::int as n from public.payments")).toEqual(paymentsBefore);
  });

  it("round 2: one member is late; penalty proposed after the grace period; pot paid with what was collected", async () => {
    const due2 = addDays(due1, 7);
    const cycle2 = await db.one<{ number: number; due_date: string; recipient_id: string }>(
      "select number, due_date, recipient_id from public.cycles where group_id = $1 and status = 'collecting'",
      [groupId],
    );
    expect({ ...cycle2, due_date: iso(cycle2.due_date) }).toEqual({ number: 2, due_date: due2, recipient_id: DEMO.koffi });

    await pay(DEMO.awa, groupId);
    await pay(DEMO.koffi, groupId);
    await railSettles();

    expect((await engine(addDays(due2, 1))).waiting).toBe(1); // within the 2 grace days
    expect(await db.all("select user_id from public.notifications where template = 'contribution_late' and payload->>'group_id' = $1", [groupId])).toEqual([
      { user_id: bintou },
    ]);

    // Manager sees Bintou as unpaid and sends a one-tap WhatsApp reminder (logged).
    const unpaid = await asUser<{ full_name: string; days_late: number }>(DEMO.awa, "select full_name from public.group_unpaid_members($1)", [groupId]);
    expect(unpaid.map((u) => u.full_name)).toEqual(["Bintou Diallo"]);
    expect((await asUser<{ v: number }>(DEMO.awa, "select public.send_group_reminders($1, 'whatsapp') as v", [groupId]))[0].v).toBe(1);
    expect((await asUser<{ v: number }>(DEMO.awa, "select public.send_group_reminders($1, 'whatsapp') as v", [groupId]))[0].v).toBe(0); // once a day
    await expect(asUser(DEMO.koffi, "select public.send_group_reminders($1, 'sms')", [groupId])).rejects.toThrow(/only the manager/);

    const out = await engine(addDays(due2, 3)); // grace over
    expect(out.paidOut).toBe(1);
    await railSettles();

    const penalty = await db.one<{ id: string; status: string; amount: number }>(
      "select id, status, amount from public.contribution_penalties where member_id = $1",
      [bintou],
    );
    expect(penalty).toMatchObject({ status: "proposed", amount: 500 });
    await expect(asUser(DEMO.koffi, "select public.review_penalty($1, true)", [penalty.id])).rejects.toThrow(/only the manager/);
    await asUser(DEMO.awa, "select public.review_penalty($1, true)", [penalty.id]);

    const payout2 = await db.one<{ amount: number; status: string }>(
      "select p.amount, p.status from public.payouts p join public.cycles c on c.id = p.cycle_id where c.group_id = $1 and c.number = 2",
      [groupId],
    );
    expect(payout2).toEqual({ amount: 20_000, status: "succeeded" });
  });

  it("round 3: the late member's share includes the confirmed penalty; the group completes", async () => {
    const cycle3 = await db.one<{ number: number; recipient_id: string }>(
      "select number, recipient_id from public.cycles where group_id = $1 and status = 'collecting'",
      [groupId],
    );
    expect(cycle3).toEqual({ number: 3, recipient_id: bintou });

    expect(await pay(bintou, groupId)).toBe(10_500);
    await pay(DEMO.awa, groupId);
    await pay(DEMO.koffi, groupId);
    await railSettles();
    const out = await engine(addDays(due1, 13));
    expect(out).toMatchObject({ paidOut: 1, completedGroups: 1 });
    await railSettles();

    expect((await db.one<{ status: string }>("select status from public.groups where id = $1", [groupId])).status).toBe("completed");
    expect((await db.one<{ status: string }>("select status from public.contribution_penalties where member_id = $1", [bintou])).status).toBe(
      "charged",
    );
    const payouts = await db.all<{ number: number; amount: number; status: string }>(
      "select c.number, p.amount, p.status from public.payouts p join public.cycles c on c.id = p.cycle_id where c.group_id = $1 order by c.number",
      [groupId],
    );
    expect(payouts).toEqual([
      { number: 1, amount: 30_000, status: "succeeded" },
      { number: 2, amount: 20_000, status: "succeeded" },
      { number: 3, amount: 30_500, status: "succeeded" },
    ]);
  });

  it("the money adds up: pot empty, commissions paid by AduPay, ledger balanced", async () => {
    const pot = await db.serviceDb().rpc<string>("ensure_ledger_account", { p_owner_type: "group", p_owner_id: groupId, p_currency: "XOF" });
    expect(await balance(pot)).toBe(0);

    // 0.5 % of 30 000, 20 000 and 30 500 (152.5 rounds up): 150 + 100 + 153.
    const awaWallet = await db.serviceDb().rpc<string>("ensure_ledger_account", { p_owner_type: "user", p_owner_id: DEMO.awa, p_currency: "XOF" });
    expect(await balance(awaWallet)).toBe(403);
    const expense = await db.serviceDb().rpc<string>("system_account", { p_name: "manager_commissions", p_currency: "XOF" });
    expect(await balance(expense)).toBe(403);

    const net = await db.all<{ net: number }>(
      "select sum(case when side = 'debit' then amount else -amount end)::bigint as net from public.ledger_entries group by currency",
    );
    for (const row of net) expect(row.net).toBe(0);
  });

  it("the manager dashboard and statement reflect the whole tontine", async () => {
    const [stats] = await asUser<{
      status: string;
      cycles_done: number;
      collection_rate: string;
      commission_earned: number;
      certified: boolean;
      proposed_penalties: number;
    }>(DEMO.awa, "select status, cycles_done, collection_rate, commission_earned, certified, proposed_penalties from public.manager_groups() where group_id = $1", [groupId]);
    expect(stats).toEqual({
      status: "completed",
      cycles_done: 3,
      collection_rate: "88.9", // 8 of 9 shares paid on time
      commission_earned: 403,
      certified: true,
      proposed_penalties: 0,
    });

    const rows = await asUser<{ entry_type: string }>(DEMO.awa, "select entry_type from public.group_statement($1)", [groupId]);
    expect(rows.filter((r) => r.entry_type === "contribution")).toHaveLength(8);
    expect(rows.filter((r) => r.entry_type === "payout")).toHaveLength(3);
    expect(rows.filter((r) => r.entry_type === "penalty")).toHaveLength(1);
    expect(await asUser(DEMO.koffi, "select * from public.group_statement($1)", [groupId])).toEqual([]);
  });
});

describe("a payout the rail rejects", () => {
  it("is released back to the pot and retried on the next run once the recipient fixes their account", async () => {
    const a = await newUser("Aya");
    const b = await newUser("Bamba");
    await db.pg.query("update public.profiles set kyc_tier = 2 where id = any($1)", [[a, b]]);
    await linkWallet(a, "9992"); // sandbox: this wallet rejects payouts
    await linkWallet(b);
    const groupId = (await asUser<{ v: string }>(a, "select public.create_group('Retry', 5000, 'weekly', current_date, 2, 'fixed', 0, 0) as v"))[0].v;
    const code = (await db.one<{ invite_code: string }>("select invite_code from public.groups where id = $1", [groupId])).invite_code;
    await asUser(b, "select public.join_group($1)", [code]);
    await asUser(a, "select public.start_group($1)", [groupId]);
    await linkWallet(a); // Aya pays from a good wallet…
    await pay(a, groupId);
    await pay(b, groupId);
    await railSettles();
    await linkWallet(a, "9992"); // …but her payout wallet is the bad one
    await db.pg.query("update public.linked_accounts set account_token = 'sbxacct_bad_9992' where user_id = $1 and is_default", [a]);

    const today = new Date().toISOString().slice(0, 10);
    await engine(today);
    await railSettles();
    const failed = await db.one<{ status: string; attempts: number }>(
      "select p.status, p.attempts from public.payouts p join public.cycles c on c.id = p.cycle_id where c.group_id = $1",
      [groupId],
    );
    expect(failed).toEqual({ status: "failed", attempts: 1 });
    const pot = await db.serviceDb().rpc<string>("ensure_ledger_account", { p_owner_type: "group", p_owner_id: groupId, p_currency: "XOF" });
    expect(await balance(pot)).toBe(10_000); // released, not lost

    await linkWallet(a); // fixed
    const r = await engine(today);
    expect(r.retried).toBe(1);
    await railSettles();
    const ok = await db.one<{ status: string; attempts: number }>(
      "select p.status, p.attempts from public.payouts p join public.cycles c on c.id = p.cycle_id where c.group_id = $1",
      [groupId],
    );
    expect(ok).toEqual({ status: "succeeded", attempts: 2 });
    expect(await balance(pot)).toBe(0);
  });
});
