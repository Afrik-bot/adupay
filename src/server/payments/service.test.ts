// End to end through the real migrations (PGlite): PaymentService + SandboxProvider
// + signed webhooks + reconciliation.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO, TestDb } from "../../../supabase/tests/harness";
import { reconcile } from "./reconcile";
import { SandboxProvider } from "./sandbox";
import { PaymentService, type PaymentRow } from "./service";

const SECRET = "test-secret-at-least-16";

let db: TestDb;
let wallet: string;

function harness() {
  let now = Date.now();
  const timers: { at: number; fn: () => void }[] = [];
  const webhooks: { body: string; headers: Record<string, string> }[] = [];
  const provider = new SandboxProvider({
    secret: SECRET,
    now: () => now,
    schedule: (fn, ms) => void timers.push({ at: now + ms, fn }),
    deliver: async (body, headers) => void webhooks.push({ body, headers }),
  });
  const service = new PaymentService(db.serviceDb(), provider);
  return {
    provider,
    service,
    webhooks,
    advance(ms: number) {
      now += ms;
      for (const t of timers.filter((t) => t.at <= now)) {
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
    },
    async deliverAll() {
      const results: PaymentRow[] = [];
      for (const w of webhooks.splice(0)) results.push(await service.handleWebhook(w.body, new Headers(w.headers)));
      return results;
    },
  };
}

const balance = () => db.serviceDb().rpc<number>("account_balance", { p_account_id: wallet });

const collect = (service: PaymentService, accountRef: string, amount = 10_000, idempotencyKey = randomUUID()) =>
  service.initiate({
    idempotencyKey,
    userId: DEMO.koffi,
    direction: "collect",
    amount,
    currency: "XOF",
    ledgerAccountId: wallet,
    account: { provider: "orange_money", ref: accountRef },
    purposeType: "wallet_topup",
  });

beforeAll(async () => {
  db = await TestDb.create();
  wallet = await db
    .serviceDb()
    .rpc<string>("ensure_ledger_account", { p_owner_type: "user", p_owner_id: DEMO.koffi, p_currency: "XOF" });
}, 60_000);

afterAll(() => db?.close());

describe("PaymentService", () => {
  it("collect -> signed webhook -> ledger credited", async () => {
    const h = harness();
    const before = await balance();
    const payment = await collect(h.service, "0700009990");
    expect(payment.status).toBe("pending");
    expect(payment.provider_ref).toMatch(/^sbx_/);
    expect(await balance()).toBe(before);

    h.advance(5_000);
    const [settled] = await h.deliverAll();
    expect(settled.status).toBe("succeeded");
    expect(await balance()).toBe(before + 10_000);
  });

  it("a failed collect records the reason and moves no money", async () => {
    const h = harness();
    const before = await balance();
    await collect(h.service, "0700009992");
    h.advance(5_000);
    const [settled] = await h.deliverAll();
    expect(settled.status).toBe("failed");
    expect(settled.failure_code).toMatch(/^[A-Z_]+$/);
    expect(await balance()).toBe(before);
  });

  it("pending-then-success: the interim pending webhook changes nothing", async () => {
    const h = harness();
    const before = await balance();
    await collect(h.service, "0700009991");
    // Step until the first callback (at the planned 1-5 s delay); the success
    // one follows at 3x that delay.
    while (h.webhooks.length === 0) h.advance(100);
    expect((await h.deliverAll()).map((p) => p.status)).toEqual(["pending"]);
    expect(await balance()).toBe(before);
    h.advance(10_000);
    expect((await h.deliverAll()).map((p) => p.status)).toEqual(["succeeded"]);
    expect(await balance()).toBe(before + 10_000);
  });

  it("a retried request with the same idempotency key does not call the rail or charge twice", async () => {
    const h = harness();
    const spy = vi.spyOn(h.provider, "collect");
    const key = randomUUID();
    const before = await balance();
    const first = await collect(h.service, "0700009990", 7_000, key);
    const retry = await collect(h.service, "0700009990", 7_000, key);
    expect(retry.id).toBe(first.id);
    expect(spy).toHaveBeenCalledTimes(1);

    h.advance(5_000);
    const delivered = h.webhooks.slice();
    await h.deliverAll();
    // The rail retries its webhook too.
    for (const w of delivered) await h.service.handleWebhook(w.body, new Headers(w.headers));
    expect(await balance()).toBe(before + 7_000);
  });

  it("refuses a forged webhook without touching the payment", async () => {
    const h = harness();
    const payment = await collect(h.service, "0700009990");
    const forged = JSON.stringify({ eventId: "e", providerRef: payment.provider_ref, status: "succeeded" });
    await expect(h.service.handleWebhook(forged, new Headers({ "x-adupay-sandbox-signature": "t=1,v1=00" }))).rejects.toThrow(
      /Invalid webhook/,
    );
    const row = await db.one<{ status: string }>("select status from public.payments where id = $1", [payment.id]);
    expect(row.status).toBe("pending");
  });

  it("rejects non-integer amounts before reaching the database", async () => {
    const h = harness();
    await expect(collect(h.service, "0700009990", 10.5)).rejects.toThrow(/positive integer/);
  });
});

describe("reconcile", () => {
  it("applies results whose webhooks were lost and flags disagreements", async () => {
    // Fresh wallet: reconcile also (correctly) settles payments other tests left pending.
    wallet = await db
      .serviceDb()
      .rpc<string>("ensure_ledger_account", { p_owner_type: "user", p_owner_id: DEMO.aminata, p_currency: "XOF" });
    const h = harness();
    const before = await balance();
    const lost = await collect(h.service, "0700009990", 3_000);
    const slow = await collect(h.service, "0700009991", 2_000);
    // A payment we recorded as succeeded that the rail says failed.
    const disputed = await collect(h.service, "0700009992", 1_000);
    await db.serviceDb().rpc("settle_payment", { p_payment_id: disputed.id, p_status: "succeeded" });
    h.advance(5_000); // every plain outcome is final by now (delays are 1-5 s)
    h.webhooks.length = 0; // every webhook lost

    const report = await reconcile(db.serviceDb(), h.provider);
    expect(report.errors).toEqual([]);
    expect(report.mismatches).toBeGreaterThanOrEqual(1);

    const status = async (id: string) =>
      (await db.one<{ status: string }>("select status from public.payments where id = $1", [id])).status;
    expect(await status(lost.id)).toBe("succeeded");
    // pending-then-success may or may not have finished, depending on its delay
    const slowRail = (await h.provider.getStatus(slow.provider_ref!)).status;
    expect(await status(slow.id)).toBe(slowRail);

    const risk = await db.all<{ kind: string }>("select kind from public.risk_events where payment_id = $1", [disputed.id]);
    expect(risk.map((r) => r.kind)).toEqual(["status_mismatch"]);
    const expected = before + 3_000 + 1_000 + (slowRail === "succeeded" ? 2_000 : 0);
    expect(await balance()).toBe(expected);

    // Running it again (rail unchanged) settles nothing new.
    const again = await reconcile(db.serviceDb(), h.provider);
    expect(again.settled).toBe(0);
    expect(await balance()).toBe(expected);
  });
});
