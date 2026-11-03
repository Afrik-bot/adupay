// Payer pour through the real migrations (PGlite), the sandbox rail and its
// signed webhooks: card -> fee + FX -> payee payout, tontine sponsorship,
// schedules, the family share link and admin FX changes.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO, TestDb } from "../../supabase/tests/harness";
import { deliverDirectedPayments, runSchedules, startDirectedPayment } from "./directed-payments";
import { SandboxProvider } from "./payments/sandbox";
import { PaymentService, type PaymentRow } from "./payments/service";

const SECRET = "test-secret-at-least-16";
let db: TestDb;
let service: PaymentService;
let now = Date.now();
const timers: { at: number; fn: () => void }[] = [];
const webhooks: { body: string; headers: Record<string, string> }[] = [];
let school: string;
let pharmacy: string;

/** Lets the rail answer and delivers webhooks, then (like the webhook route) sends paid payments on. */
async function railSettles(rounds = 2) {
  for (let i = 0; i < rounds; i++) {
    now += 20_000;
    for (const t of timers.filter((t) => t.at <= now)) {
      timers.splice(timers.indexOf(t), 1);
      t.fn();
    }
    const settled: PaymentRow[] = [];
    for (const w of webhooks.splice(0)) settled.push(await service.handleWebhook(w.body, new Headers(w.headers)));
    if (settled.some((p) => p.purpose_type === "directed_payment" && p.status === "succeeded")) {
      await deliverDirectedPayments(db.serviceDb(), service);
    }
  }
}

const card = (last4 = "4242") => ({ token: `sbxcard_test_${last4}`, brand: "visa", last4 });
const pay = (overrides: Partial<Parameters<typeof startDirectedPayment>[2]> = {}) =>
  startDirectedPayment(db.serviceDb(), service, {
    senderId: DEMO.aminata,
    requestKey: randomUUID(),
    purpose: "school",
    payeeId: school,
    groupId: null,
    beneficiaryName: "Fatou Traoré",
    reference: "CM2 B · matricule 1234",
    amountXof: 150_000,
    currency: "EUR",
    card: card(),
    ...overrides,
  });
const dpRow = (id: string) =>
  db.one<{ status: string; paid_at: Date | null; received_at: Date | null; failure_code: string | null }>(
    "select status, paid_at, received_at, failure_code from public.directed_payments where id = $1",
    [id],
  );
const balanceOf = (code: string) =>
  db.one<{ b: number }>(
    "select public.account_balance(id) as b from public.ledger_accounts where code = $1",
    [code],
  );

beforeAll(async () => {
  db = await TestDb.create();
  await db.pg.query("update public.profiles set kyc_tier = 2 where id = any($1)", [[DEMO.aminata, DEMO.koffi, DEMO.awa]]);
  service = new PaymentService(
    db.serviceDb(),
    new SandboxProvider({
      secret: SECRET,
      now: () => now,
      schedule: (fn, ms) => void timers.push({ at: now + ms, fn }),
      deliver: async (body, headers) => void webhooks.push({ body, headers }),
    }),
  );
  school = (await db.one<{ id: string }>("select id from public.payees where category = 'school' limit 1")).id;
  pharmacy = (await db.one<{ id: string }>("select id from public.payees where category = 'pharmacy' limit 1")).id;
}, 120_000);

afterAll(() => db?.close());

describe("quotes", () => {
  it("150 000 FCFA in euros: base at the peg, 1.9 % fee, all-in cost shown", async () => {
    const [q] = await db.asUser(DEMO.aminata, async (q) =>
      (await q.query<Record<string, unknown>>("select * from public.fx_quote(150000, 'EUR')")).rows,
    );
    // 150 000 / 655.957 = 228.6735 € -> 228.68 €; fee 1.9 % = 4.34 €; total 233.02 €.
    expect(q).toMatchObject({ base_amount: 22868, fee_amount: 434, total_amount: 23302, fee_bps: 190, fx_margin_bps: 0 });
    expect(Number(q.all_in_pct)).toBeCloseTo(1.9, 1);
  });

  it("rejects amounts outside 1 000 – 2 000 000 FCFA", async () => {
    await expect(db.asUser(DEMO.aminata, (q) => q.query("select * from public.fx_quote(500, 'USD')"))).rejects.toThrow(/between 1 000/);
  });

  it("only admins change rates, and the change is audited", async () => {
    await expect(
      db.asUser(DEMO.aminata, (q) => q.query("select public.set_fx_rate('USD', 610, 190, 0)")),
    ).rejects.toThrow(/only admins/);
    await db.asUser(DEMO.awa, (q) => q.query("select public.set_fx_rate('USD', 610, 150, 25)"));
    const [q] = await db.asUser(DEMO.aminata, async (q) => (await q.query<{ fee_bps: number; customer_rate: string }>("select * from public.fx_quote(61000, 'USD')")).rows);
    expect(q.fee_bps).toBe(150);
    expect(Number(q.customer_rate)).toBeCloseTo(608.475, 3); // 610 less a 0.25 % FX margin
    expect(await db.one("select action from public.audit_log where target_table = 'fx_rates'")).toEqual({ action: "fx.update" });
    await db.asUser(DEMO.awa, (q) => q.query("select public.set_fx_rate('USD', 600, 190, 0)"));
  });
});

describe("verified payees only (enforced in the database)", () => {
  it("an unverified payee is refused even by the server", async () => {
    const pending = (
      await db.one<{ id: string }>(
        "insert into public.payees (name, category, city, kyb_status) values ('École non vérifiée', 'school', 'Abidjan', 'pending') returning id",
      )
    ).id;
    expect(await pay({ payeeId: pending })).toEqual({ error: "payeeNotVerified" });
    await expect(
      db.pg.query(
        `insert into public.directed_payments (sender_id, payee_id, purpose, beneficiary_name, amount, source_currency, source_amount, fee_amount, fx_rate)
         values ($1, $2, 'school', 'X', 1000, 'EUR', 200, 4, 655.957)`,
        [DEMO.aminata, pending],
      ),
    ).rejects.toThrow(/payee_not_verified/);
  });

  it("a payee of the wrong kind is refused (school fees cannot go to a pharmacy)", async () => {
    expect(await pay({ payeeId: pharmacy })).toEqual({ error: "payeeNotVerified" });
  });
});

describe("a school payment from Paris", () => {
  it("card -> Payé -> Reçu, with the money and the fee in the right places", async () => {
    const feesBefore = (await balanceOf("system:fee_revenue:EUR")).b;
    const result = await pay();
    if ("error" in result) throw new Error(result.error);
    const id = result.directedPayment.id;
    expect(result.directedPayment).toMatchObject({ amount: 150_000, source_currency: "EUR", source_amount: 23302, fee_amount: 434 });
    expect((await dpRow(id)).status).toBe("initiated");

    await railSettles();
    const row = await dpRow(id);
    expect({ status: row.status, code: row.failure_code }).toEqual({ status: "received", code: null });
    expect(row.paid_at).toBeTruthy();
    expect(row.received_at).toBeTruthy();

    expect((await balanceOf("system:fee_revenue:EUR")).b - feesBefore).toBe(434);
    expect((await balanceOf(`payee:${school}:XOF`)).b).toBe(0); // delivered on to the school
    expect((await balanceOf("system:fx_clearing:EUR")).b).toBe(0); // fully converted
    const nets = await db.all<{ net: number }>(
      "select sum(case when side = 'debit' then amount else -amount end)::bigint as net from public.ledger_entries group by currency",
    );
    for (const n of nets) expect(n.net).toBe(0);
  });

  it("the same request key never charges twice", async () => {
    const key = randomUUID();
    const a = await pay({ requestKey: key });
    const b = await pay({ requestKey: key });
    if ("error" in a || "error" in b) throw new Error("unexpected error");
    expect(b.directedPayment.id).toBe(a.directedPayment.id);
    expect((await db.one<{ n: number }>("select count(*)::int as n from public.payments where purpose_id = $1", [a.directedPayment.id])).n).toBe(1);
    await railSettles();
  });

  it("a declined card fails cleanly: nothing converted, nothing sent", async () => {
    const result = await pay({ card: card("9992") });
    if ("error" in result) throw new Error(result.error);
    await railSettles();
    expect((await dpRow(result.directedPayment.id)).status).toBe("failed");
    expect(
      await db.all("select * from public.ledger_transactions where idempotency_key = $1", [`dp-fx:${result.directedPayment.id}`]),
    ).toEqual([]);
  });

  it("KYC limits apply to the euro amount at its FCFA value", async () => {
    await db.pg.query("update public.profiles set kyc_tier = 0 where id = $1", [DEMO.koffi]);
    expect(await pay({ senderId: DEMO.koffi })).toEqual({ error: "kycRequired" });
    await db.pg.query("update public.profiles set kyc_tier = 2 where id = $1", [DEMO.koffi]);
  });
});

describe("paying a tontine share from abroad", () => {
  it("a sponsor's payment settles the member's share straight into the pot", async () => {
    const groupId = (
      await db.asUser(DEMO.awa, async (q) =>
        (await q.query<{ v: string }>("select public.create_group('Famille Koné', 20000, 'monthly', current_date, 5, 'fixed', 3, 0) as v")).rows,
      )
    )[0].v;
    const code = (await db.one<{ invite_code: string }>("select invite_code from public.groups where id = $1", [groupId])).invite_code;
    await db.asUser(DEMO.koffi, (q) => q.query("select public.join_group($1)", [code]));
    await db.asUser(DEMO.awa, (q) => q.query("select public.start_group($1)", [groupId]));

    // Aminata (in Paris) sponsors Koffi through the same invite link.
    const members = await db.asUser(DEMO.aminata, async (q) => (await q.query<{ first_name: string }>("select first_name from public.group_invite_members($1)", [code])).rows);
    expect(members.map((m) => m.first_name)).toEqual(["Awa", "Koffi"]);
    await db.asUser(DEMO.aminata, (q) => q.query("select public.join_group_as_sponsor($1, $2)", [code, DEMO.koffi]));
    await expect(db.asUser(DEMO.awa, (q) => q.query("select public.join_group_as_sponsor($1, $2)", [code, DEMO.koffi]))).rejects.toThrow(
      /already_member/,
    );

    expect(await pay({ purpose: "tontine", payeeId: null, groupId: groupId, senderId: DEMO.awa })).toEqual({ error: "notSponsor" });
    const result = await pay({ purpose: "tontine", payeeId: null, groupId, beneficiaryName: "Koffi Yao", amountXof: 1 });
    if ("error" in result) throw new Error(result.error);
    expect(result.directedPayment.amount).toBe(20_000); // the share, not what was typed

    await railSettles();
    expect((await dpRow(result.directedPayment.id)).status).toBe("confirmed");
    const [koffi] = await db.asUser(DEMO.awa, async (q) =>
      (await q.query<{ paid_current: boolean }>("select paid_current from public.group_members_status($1) where user_id = $2", [groupId, DEMO.koffi])).rows,
    );
    expect(koffi.paid_current).toBe(true);
    expect((await balanceOf(`group:${groupId}:XOF`)).b).toBe(20_000);

    const sponsorships = await db.asUser(DEMO.aminata, async (q) => (await q.query<{ member_name: string; paid: boolean }>("select member_name, paid from public.my_sponsorships()")).rows);
    expect(sponsorships).toContainEqual({ member_name: "Koffi Yao", paid: true });
  });
});

describe("recurring schedules", () => {
  it("runs once per due date, moves to next month, and skips paused schedules", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const schedule = await db.one<{ id: string }>(
      `insert into public.directed_payment_schedules (sender_id, purpose, payee_id, beneficiary_name, reference, amount, source_currency, frequency, next_run_on, card_token, card_brand, card_last4)
       values ($1, 'school', $2, 'Fatou Traoré', 'CM2 B', 75000, 'EUR', 'monthly', $3, 'sbxcard_sched_4242', 'visa', '4242') returning id`,
      [DEMO.aminata, school, today],
    );
    const first = await runSchedules(db.serviceDb(), service, today);
    expect(first).toEqual({ ran: 1, failed: [] });
    expect((await runSchedules(db.serviceDb(), service, today)).ran).toBe(0);
    const next = await db.one<{ next_run_on: Date }>("select next_run_on from public.directed_payment_schedules where id = $1", [schedule.id]);
    const expected = new Date(`${today}T00:00:00Z`);
    expected.setUTCMonth(expected.getUTCMonth() + 1);
    expect(next.next_run_on.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
    await railSettles();

    await db.asUser(DEMO.aminata, (q) => q.query("select public.set_schedule_status($1, 'paused')", [schedule.id]));
    await db.pg.query("update public.directed_payment_schedules set next_run_on = $1 where id = $2", [today, schedule.id]);
    expect((await runSchedules(db.serviceDb(), service, today)).ran).toBe(0);
    await expect(db.asUser(DEMO.koffi, (q) => q.query("select public.set_schedule_status($1, 'cancelled')", [schedule.id]))).rejects.toThrow(/not found/);
  });

  it("users never see the stored card token", async () => {
    await expect(
      db.asUser(DEMO.aminata, (q) => q.query("select card_token from public.directed_payment_schedules")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("the family share link", () => {
  it("shows the status and payee, first names only, no card or full reference — to anyone with the link", async () => {
    const result = await pay();
    if ("error" in result) throw new Error(result.error);
    await railSettles();
    const token = (await db.one<{ share_token: string }>("select share_token from public.directed_payments where id = $1", [result.directedPayment.id])).share_token;
    const rows = await db.as({ role: "anon" }, async (q) => (await q.query<Record<string, unknown>>("select * from public.directed_payment_public($1)", [token])).rows);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "received", beneficiary_name: "Fatou Traoré", sender_first_name: "Aminata", amount: 150_000, reference_hint: "…1234" });
    expect(JSON.stringify(rows[0])).not.toMatch(/matricule|4242|EUR/);
    expect((await db.as({ role: "anon" }, async (q) => (await q.query("select * from public.directed_payment_public('short')")).rows))).toEqual([]);
  });
});
