// Admin & compliance through the real migrations (PGlite): monitoring rules,
// the sanctions stub, case management, KPIs and transaction search.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db";
import { DEMO, TestDb } from "../../supabase/tests/harness";
import { SandboxProvider } from "./payments/sandbox";
import { PaymentService } from "./payments/service";

let db: TestDb;
let svc: Db;
let service: PaymentService;

const as = <T>(user: string, sql: string, params: unknown[] = []) => db.asUser(user, async (q) => (await q.query<T>(sql, params)).rows);
const events = (kind: string, user?: string) =>
  db.all<{ id: string; severity: string; details: Record<string, unknown> }>(
    `select id, severity, details from public.risk_events where kind = $1 ${user ? "and subject_user_id = $2" : ""}`,
    user ? [kind, user] : [kind],
  );
const wallet = (user: string) => svc.rpc<string>("ensure_ledger_account", { p_owner_type: "user", p_owner_id: user, p_currency: "XOF" });
const collect = async (user: string | null, account: string, amount = 1_000) =>
  svc.rpc<{ id: string }>("create_payment", {
    p_idempotency_key: randomUUID(),
    p_user_id: user,
    p_direction: "collect",
    p_provider: "sandbox",
    p_amount: amount,
    p_currency: "XOF",
    p_ledger_account_id: account,
  });

beforeAll(async () => {
  db = await TestDb.create();
  svc = db.serviceDb();
  service = new PaymentService(svc, new SandboxProvider({ secret: "test-secret-at-least-16" }));
  await db.pg.query("update public.profiles set kyc_tier = 2 where id = any($1)", [[DEMO.awa, DEMO.koffi, DEMO.aminata]]);
}, 120_000);

afterAll(() => db?.close());

describe("monitoring rules", () => {
  it("more than 5 payments in an hour opens one case, not one per payment", async () => {
    const w = await wallet(DEMO.koffi);
    for (let i = 0; i < 5; i++) await collect(DEMO.koffi, w);
    expect(await events("velocity_1h", DEMO.koffi)).toEqual([]);
    await collect(DEMO.koffi, w);
    await collect(DEMO.koffi, w);
    const found = await events("velocity_1h", DEMO.koffi);
    expect(found).toHaveLength(1);
    expect(found[0].details.payments_last_hour).toBe(6);
  });

  it("a payment above the KYC limit is refused and still recorded as a case", async () => {
    await db.pg.query("update public.profiles set kyc_tier = 1 where id = $1", [DEMO.aminata]);
    const account = await wallet(DEMO.aminata);
    const go = () =>
      service.initiate({
        idempotencyKey: randomUUID(),
        userId: DEMO.aminata,
        direction: "collect",
        amount: 250_000,
        currency: "XOF",
        ledgerAccountId: account,
        account: { provider: "wave", ref: "x_9990" },
      });
    await expect(go()).rejects.toThrow(/kyc_daily_limit/);
    await expect(go()).rejects.toThrow(/kyc_daily_limit/);
    const found = await events("kyc_limit_exceeded", DEMO.aminata);
    expect(found).toHaveLength(1); // once per person per day
    expect(found[0].details).toMatchObject({ amount: 250_000, kyc_tier: 1 });
    await db.pg.query("update public.profiles set kyc_tier = 2 where id = $1", [DEMO.aminata]);
  });

  it("paying 3 payees for the first time in one day opens a case", async () => {
    const payees = await db.all<{ id: string; category: string }>(
      "select distinct on (category) id, category from public.payees where kyb_status = 'approved' and category in ('school', 'clinic', 'utility') order by category, name",
    );
    const purpose = { school: "school", clinic: "health", utility: "bills" } as Record<string, string>;
    for (const p of payees) {
      await db.pg.query(
        `insert into public.directed_payments (sender_id, payee_id, purpose, beneficiary_name, amount, source_currency, source_amount, fee_amount, fx_rate, status)
         values ($1, $2, $3, 'X Y', 10000, 'EUR', 1561, 29, 655.957, 'received')`,
        [DEMO.awa, p.id, purpose[p.category]],
      );
    }
    expect(await events("new_payees_day", DEMO.awa)).toHaveLength(1);
  });

  it("the all-in cost is recorded on each directed payment when it is made", async () => {
    const row = await db.one<{ all_in_pct: string }>("select all_in_pct from public.directed_payments limit 1");
    expect(Number(row.all_in_pct)).toBeCloseTo(2.38, 1); // 15.61 € for 10 000 FCFA vs 15.24 € at mid
  });
});

describe("sanctions screening stub", () => {
  let target: string;

  beforeAll(async () => {
    target = randomUUID();
    await db.pg.query("insert into auth.users (id, phone, raw_user_meta_data) values ($1, '2250500009999', $2)", [
      target,
      JSON.stringify({ full_name: "Interdite Ama Demo" }), // same words, other order, no accent
    ]);
  });

  it("screens the name at sign-up: a hit opens a high-severity case", async () => {
    expect((await db.one<{ sanctions_status: string }>("select sanctions_status from public.profiles where id = $1", [target])).sanctions_status).toBe("hit");
    const found = await events("sanctions_hit", target);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: "high", details: { list_name: "Ama Démo Interdite", subject: "profile" } });
    // A normal name stays clear.
    expect((await db.one<{ sanctions_status: string }>("select sanctions_status from public.profiles where id = $1", [DEMO.koffi])).sanctions_status).toBe("clear");
  });

  it("blocks payouts to a hit until an admin clears it (audited)", async () => {
    const pot = await svc.rpc<string>("ensure_ledger_account", { p_owner_type: "group", p_owner_id: randomUUID(), p_currency: "XOF" });
    const p = await collect(null, pot, 50_000);
    await svc.rpc("settle_payment", { p_payment_id: p.id, p_status: "succeeded" });
    const payout = () =>
      svc.rpc("create_payment", {
        p_idempotency_key: randomUUID(),
        p_user_id: target,
        p_direction: "payout",
        p_provider: "sandbox",
        p_amount: 10_000,
        p_currency: "XOF",
        p_ledger_account_id: pot,
        p_purpose_type: "tontine_payout",
      });
    await expect(payout()).rejects.toThrow(/sanctions_hold/);

    await expect(as(DEMO.koffi, "select public.clear_sanctions_hit('profile', $1, 'homonyme')", [target])).rejects.toThrow(/only admins/);
    await expect(as(DEMO.awa, "select public.clear_sanctions_hit('profile', $1, '')", [target])).rejects.toThrow(/reason/);
    await as(DEMO.awa, "select public.clear_sanctions_hit('profile', $1, 'Homonyme vérifié : date de naissance différente')", [target]);
    await expect(payout()).resolves.toBeTruthy();
    expect(await db.one("select action from public.audit_log where target_id = $1", [target])).toEqual({ action: "sanctions.clear" });
  });

  it("screens business names too", async () => {
    await db.pg.query("insert into public.payees (name, category, city) values ('SOCIETE ECRAN EXEMPLE SARL', 'landlord', 'Abidjan')");
    const payee = await db.one<{ sanctions_status: string }>("select sanctions_status from public.payees where name = 'SOCIETE ECRAN EXEMPLE SARL'");
    expect(payee.sanctions_status).toBe("hit");
  });
});

describe("case management", () => {
  it("only staff move cases; each change needs a note and is audited; notes cannot be edited", async () => {
    const [risk] = await events("velocity_1h", DEMO.koffi);
    await expect(as(DEMO.koffi, "select public.update_risk_case($1, 'closed', 'ok')", [risk.id])).rejects.toThrow(/only compliance staff/);
    await expect(as(DEMO.awa, "select public.update_risk_case($1, 'reviewing', ' ')", [risk.id])).rejects.toThrow(/note is required/);

    await as(DEMO.awa, "select public.update_risk_case($1, 'reviewing', 'Je contacte le membre.')", [risk.id]);
    await as(DEMO.awa, "select public.update_risk_case($1, 'closed', 'Six cotisations pour sa famille : légitime.')", [risk.id]);
    expect(await db.one("select status, assigned_to from public.risk_events where id = $1", [risk.id])).toEqual({ status: "closed", assigned_to: DEMO.awa });
    const notes = await as<{ status_change: string }>(DEMO.awa, "select status_change from public.risk_event_notes where risk_event_id = $1 order by id", [risk.id]);
    expect(notes.map((n) => n.status_change)).toEqual(["open -> reviewing", "reviewing -> closed"]);
    expect((await db.all("select * from public.audit_log where action = 'risk.update' and target_id = $1", [risk.id])).length).toBe(2);
    await expect(db.pg.query("update public.risk_event_notes set note = 'x'")).rejects.toThrow(/append-only/);
    expect(await as(DEMO.koffi, "select * from public.risk_event_notes")).toEqual([]);
  });
});

describe("KPIs and search", () => {
  it("KPIs are staff-only and add up", async () => {
    await expect(as(DEMO.koffi, "select * from public.admin_kpis()")).rejects.toThrow(/staff only/);
    const [k] = await as<Record<string, unknown>>(DEMO.awa, "select * from public.admin_kpis()");
    expect(k.active_tontines).toBe(1); // the seeded Adjamé group
    expect(k.corridors).toEqual([{ corridor: "EUR → XOF", count: 3, volume_xof: 30_000 }]);
    expect(Number(k.avg_all_in_pct)).toBeCloseTo(2.38, 1);
    expect(k.open_risk_cases).toBeGreaterThanOrEqual(3);
  });

  it("transaction search finds by name or reference, for staff only", async () => {
    await expect(as(DEMO.koffi, "select * from public.admin_search_payments('Koffi')")).rejects.toThrow(/staff only/);
    const byName = await as<{ user_name: string }>(DEMO.awa, "select user_name from public.admin_search_payments('koffi')");
    expect(byName.length).toBeGreaterThanOrEqual(7);
    expect(byName.every((r) => r.user_name === "Koffi Yao")).toBe(true);
  });
});
