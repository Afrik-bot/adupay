import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db";
import { DEMO, TestDb } from "./harness";

let db: TestDb;
let svc: Db;
let awaWallet: string;
let koffiWallet: string;
let groupPot: string;
let settlement: string;

const debit = (account_id: string, amount: number) => ({ account_id, side: "debit", amount });
const credit = (account_id: string, amount: number) => ({ account_id, side: "credit", amount });
const key = () => `test-${randomUUID()}`;

async function balance(account: string) {
  return svc.rpc<number>("account_balance", { p_account_id: account });
}

async function counts() {
  return db.one<{ tx: number; entries: number }>(
    "select (select count(*)::int from public.ledger_transactions) as tx, (select count(*)::int from public.ledger_entries) as entries",
  );
}

/** Credits a user wallet as if a collect from their mobile wallet succeeded. */
async function fund(account: string, amount: number) {
  const payment = await svc.rpc<{ id: string }>("create_payment", {
    p_idempotency_key: key(),
    p_user_id: null,
    p_direction: "collect",
    p_provider: "sandbox",
    p_amount: amount,
    p_currency: "XOF",
    p_ledger_account_id: account,
  });
  await svc.rpc("settle_payment", { p_payment_id: payment.id, p_status: "succeeded" });
}

async function netPerCurrency() {
  return db.all<{ currency: string; net: number }>(
    `select currency, sum(case when side = 'debit' then amount else -amount end)::bigint as net
       from public.ledger_entries group by currency`,
  );
}

beforeAll(async () => {
  db = await TestDb.create();
  // These tests are about the ledger, not KYC limits (see kyc.test.ts).
  await db.pg.query("update public.profiles set kyc_tier = 2");
  svc = db.serviceDb();
  const ensure = (type: string, id: string) =>
    svc.rpc<string>("ensure_ledger_account", { p_owner_type: type, p_owner_id: id, p_currency: "XOF" });
  awaWallet = await ensure("user", DEMO.awa);
  koffiWallet = await ensure("user", DEMO.koffi);
  groupPot = await ensure("group", DEMO.adjameGroup);
  settlement = await svc.rpc<string>("system_account", { p_name: "partner_settlement", p_currency: "XOF" });
}, 60_000);

afterAll(() => db?.close());

describe("accounts", () => {
  it("ensure_ledger_account is idempotent", async () => {
    const again = await svc.rpc<string>("ensure_ledger_account", {
      p_owner_type: "user",
      p_owner_id: DEMO.awa,
      p_currency: "XOF",
    });
    expect(again).toBe(awaWallet);
  });

  it("a new account has a zero balance", async () => {
    const fresh = await svc.rpc<string>("ensure_ledger_account", {
      p_owner_type: "user",
      p_owner_id: DEMO.aminata,
      p_currency: "EUR",
    });
    expect(await balance(fresh)).toBe(0);
  });
});

describe("post_ledger_transaction", () => {
  beforeEach(async () => {
    if ((await balance(awaWallet)) < 100_000) await fund(awaWallet, 100_000);
  });

  it("posts a balanced transfer and derives balances from entries", async () => {
    const [awaBefore, koffiBefore] = [await balance(awaWallet), await balance(koffiWallet)];
    await svc.rpc("post_ledger_transaction", {
      p_idempotency_key: key(),
      p_kind: "p2p",
      p_entries: [debit(awaWallet, 15_000), credit(koffiWallet, 15_000)],
    });
    expect(await balance(awaWallet)).toBe(awaBefore - 15_000);
    expect(await balance(koffiWallet)).toBe(koffiBefore + 15_000);
  });

  it("the same idempotency key posts once, however many times it is sent", async () => {
    const k = key();
    const entries = [debit(awaWallet, 1_000), credit(koffiWallet, 1_000)];
    const before = await counts();
    const first = await svc.rpc<string>("post_ledger_transaction", { p_idempotency_key: k, p_kind: "p2p", p_entries: entries });
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        svc.rpc<string>("post_ledger_transaction", { p_idempotency_key: k, p_kind: "p2p", p_entries: entries }),
      ),
    );
    expect(new Set([first, ...results])).toEqual(new Set([first]));
    expect(await counts()).toEqual({ tx: before.tx + 1, entries: before.entries + 2 });
  });

  it("reusing a key with a different request is refused", async () => {
    const k = key();
    await svc.rpc("post_ledger_transaction", {
      p_idempotency_key: k,
      p_kind: "p2p",
      p_entries: [debit(awaWallet, 1_000), credit(koffiWallet, 1_000)],
    });
    await expect(
      svc.rpc("post_ledger_transaction", {
        p_idempotency_key: k,
        p_kind: "p2p",
        p_entries: [debit(awaWallet, 9_000), credit(koffiWallet, 9_000)],
      }),
    ).rejects.toThrow(/reused with a different request/);
  });

  it.each([
    ["unbalanced", [debit("A", 1_000), credit("B", 999)], /unbalanced/],
    ["single entry", [debit("A", 1_000)], /at least two entries/],
    ["zero amount", [debit("A", 0), credit("B", 0)], /positive integer/],
    ["negative amount", [debit("A", -5), credit("B", -5)], /positive integer/],
    ["fractional amount", [debit("A", 10.5), credit("B", 10.5)], /positive integer/],
    ["string amount", [debit("A", "100" as unknown as number), credit("B", 100)], /must be a number/],
    ["overdraft", [debit("A", 10_000_000), credit("B", 10_000_000)], /insufficient funds/],
  ])("rejects %s and leaves no partial entries", async (_name, template, error) => {
    const entries = template.map((e) => ({ ...e, account_id: e.account_id === "A" ? awaWallet : koffiWallet }));
    const before = await counts();
    const awaBefore = await balance(awaWallet);
    await expect(
      svc.rpc("post_ledger_transaction", { p_idempotency_key: key(), p_kind: "p2p", p_entries: entries }),
    ).rejects.toThrow(error);
    expect(await counts()).toEqual(before);
    expect(await balance(awaWallet)).toBe(awaBefore);
  });

  it("rejects entries whose currency differs from the account", async () => {
    const eurWallet = await svc.rpc<string>("ensure_ledger_account", {
      p_owner_type: "user",
      p_owner_id: DEMO.koffi,
      p_currency: "EUR",
    });
    const before = await counts();
    // The function takes the currency from each account, so a cross-currency pair
    // is unbalanced per currency.
    await expect(
      svc.rpc("post_ledger_transaction", {
        p_idempotency_key: key(),
        p_kind: "p2p",
        p_entries: [debit(awaWallet, 1_000), credit(eurWallet, 1_000)],
      }),
    ).rejects.toThrow(/unbalanced/);
    expect(await counts()).toEqual(before);
  });

  it("the commit-time check rejects an unbalanced transaction written around the function", async () => {
    const before = await counts();
    await expect(
      db.pg.transaction(async (tx) => {
        const t = await tx.query<{ id: string }>(
          "insert into public.ledger_transactions (idempotency_key, kind) values ($1, 'raw') returning id",
          [key()],
        );
        await tx.query(
          "insert into public.ledger_entries (transaction_id, account_id, side, amount, currency) values ($1, $2, 'debit', 500, 'XOF')",
          [t.rows[0].id, awaWallet],
        );
      }),
    ).rejects.toThrow(/unbalanced/);
    expect(await counts()).toEqual(before);
  });
});

describe("append-only ledger", () => {
  it("entries cannot be updated, deleted or truncated, even by the database owner", async () => {
    await fund(koffiWallet, 500);
    await expect(db.pg.query("update public.ledger_entries set amount = amount + 1")).rejects.toThrow(/append-only/);
    await expect(db.pg.query("delete from public.ledger_entries")).rejects.toThrow(/append-only/);
    await expect(db.pg.query("truncate public.ledger_entries cascade")).rejects.toThrow(/append-only/);
    await expect(db.pg.query("delete from public.ledger_transactions")).rejects.toThrow(/append-only/);
  });
});

describe("payment lifecycle", () => {
  async function createPayment(direction: "collect" | "payout", account: string, amount: number, k = key()) {
    return svc.rpc<{ id: string; status: string }>("create_payment", {
      p_idempotency_key: k,
      p_user_id: DEMO.awa,
      p_direction: direction,
      p_provider: "sandbox",
      p_amount: amount,
      p_currency: "XOF",
      p_ledger_account_id: account,
    });
  }
  const settle = (id: string, status: string, code: string | null = null) =>
    svc.rpc<{ status: string }>("settle_payment", { p_payment_id: id, p_status: status, p_failure_code: code });

  it("a successful collect credits the target account and the settlement account", async () => {
    const [potBefore, settlementBefore] = [await balance(groupPot), await balance(settlement)];
    const payment = await createPayment("collect", groupPot, 10_000);
    expect(await balance(groupPot)).toBe(potBefore); // nothing until the rail confirms
    await settle(payment.id, "succeeded");
    expect(await balance(groupPot)).toBe(potBefore + 10_000);
    expect(await balance(settlement)).toBe(settlementBefore + 10_000);
  });

  it("a failed collect posts nothing", async () => {
    const before = await counts();
    const payment = await createPayment("collect", groupPot, 10_000);
    const settled = await settle(payment.id, "failed", "INSUFFICIENT_FUNDS");
    expect(settled.status).toBe("failed");
    expect(await counts()).toEqual(before);
  });

  it("a payout reserves funds immediately and releases them if the rail fails", async () => {
    await fund(groupPot, 30_000);
    const potBefore = await balance(groupPot);
    const payment = await createPayment("payout", groupPot, 30_000);
    expect(await balance(groupPot)).toBe(potBefore - 30_000);
    await settle(payment.id, "failed", "ACCOUNT_BLOCKED");
    expect(await balance(groupPot)).toBe(potBefore);
  });

  it("a successful payout leaves the partner settlement account", async () => {
    await fund(groupPot, 20_000);
    const [potBefore, settlementBefore] = [await balance(groupPot), await balance(settlement)];
    const payment = await createPayment("payout", groupPot, 20_000);
    await settle(payment.id, "succeeded");
    expect(await balance(groupPot)).toBe(potBefore - 20_000);
    expect(await balance(settlement)).toBe(settlementBefore - 20_000);
  });

  it("a payout larger than the pot is refused and leaves nothing behind", async () => {
    const before = await counts();
    const paymentsBefore = await db.one<{ n: number }>("select count(*)::int as n from public.payments");
    await expect(createPayment("payout", groupPot, 999_999_999)).rejects.toThrow(/insufficient funds/);
    expect(await counts()).toEqual(before);
    expect(await db.one("select count(*)::int as n from public.payments")).toEqual(paymentsBefore);
  });

  it("create_payment with the same key returns the same payment and holds once", async () => {
    await fund(groupPot, 5_000);
    const k = key();
    const potBefore = await balance(groupPot);
    const [a, b] = await Promise.all([createPayment("payout", groupPot, 5_000, k), createPayment("payout", groupPot, 5_000, k)]);
    expect(a.id).toBe(b.id);
    expect(await balance(groupPot)).toBe(potBefore - 5_000);
    await expect(createPayment("payout", groupPot, 6_000, k)).rejects.toThrow(/different payment/);
  });

  it("repeated webhooks are no-ops; a contradicting one becomes a risk event", async () => {
    const payment = await createPayment("collect", koffiWallet, 2_500);
    await settle(payment.id, "succeeded");
    const before = await counts();
    await settle(payment.id, "succeeded");
    await settle(payment.id, "pending");
    expect(await counts()).toEqual(before);

    const after = await settle(payment.id, "failed", "LATE_REVERSAL");
    expect(after.status).toBe("succeeded");
    const risk = await db.all<{ kind: string; severity: string }>(
      "select kind, severity from public.risk_events where payment_id = $1",
      [payment.id],
    );
    expect(risk).toEqual([{ kind: "conflicting_settlement", severity: "high" }]);
  });
});

describe("reconcile_payment", () => {
  async function pendingCollect(amount = 1_000) {
    return svc.rpc<{ id: string }>("create_payment", {
      p_idempotency_key: key(),
      p_user_id: DEMO.koffi,
      p_direction: "collect",
      p_provider: "sandbox",
      p_amount: amount,
      p_currency: "XOF",
      p_ledger_account_id: koffiWallet,
    });
  }
  const reconcile = (id: string, status: string) =>
    svc.rpc<string>("reconcile_payment", { p_payment_id: id, p_provider_status: status });

  it("applies a final status whose webhook never arrived", async () => {
    const payment = await pendingCollect(4_000);
    const before = await balance(koffiWallet);
    expect(await reconcile(payment.id, "succeeded")).toBe("settled");
    expect(await balance(koffiWallet)).toBe(before + 4_000);
    expect(await reconcile(payment.id, "succeeded")).toBe("ok");
  });

  it("flags a rail that disagrees with our record", async () => {
    const payment = await pendingCollect();
    await svc.rpc("settle_payment", { p_payment_id: payment.id, p_status: "succeeded" });
    expect(await reconcile(payment.id, "failed")).toBe("mismatch");
    const risk = await db.one<{ kind: string }>("select kind from public.risk_events where payment_id = $1", [payment.id]);
    expect(risk.kind).toBe("status_mismatch");
  });

  it("flags a pending payment that has been stuck for over an hour", async () => {
    const payment = await pendingCollect();
    // Back-date it (payments is not append-only; only ledger tables are).
    await db.pg.query("update public.payments set created_at = now() - interval '2 hours' where id = $1", [payment.id]);
    expect(await reconcile(payment.id, "pending")).toBe("pending");
    const risk = await db.one<{ kind: string }>("select kind from public.risk_events where payment_id = $1", [payment.id]);
    expect(risk.kind).toBe("stale_pending");
  });
});

describe("invariants under load", () => {
  it("many interleaved payments: debits always equal credits and balances match payments", async () => {
    const wallet = await svc.rpc<string>("ensure_ledger_account", {
      p_owner_type: "group",
      p_owner_id: DEMO.yopougonGroup,
      p_currency: "XOF",
    });
    let rng = 42;
    const random = () => ((rng = (rng * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

    let expected = 0;
    for (let i = 0; i < 60; i++) {
      const amount = 100 + Math.floor(random() * 50_000);
      const direction = random() < 0.6 || expected < amount ? "collect" : "payout";
      const outcome = random() < 0.85 ? "succeeded" : "failed";
      const payment = await svc.rpc<{ id: string }>("create_payment", {
        p_idempotency_key: key(),
        p_user_id: null,
        p_direction: direction,
        p_provider: "sandbox",
        p_amount: amount,
        p_currency: "XOF",
        p_ledger_account_id: wallet,
      });
      await svc.rpc("settle_payment", { p_payment_id: payment.id, p_status: outcome });
      if (outcome === "succeeded") expected += direction === "collect" ? amount : -amount;
    }

    expect(await balance(wallet)).toBe(expected);
    for (const { net } of await netPerCurrency()) expect(net).toBe(0);
  });

  it("concurrent payouts from one pot never overdraw it", async () => {
    const pot = await svc.rpc<string>("ensure_ledger_account", {
      p_owner_type: "group",
      p_owner_id: randomUUID(),
      p_currency: "XOF",
    });
    await fund(pot, 50_000);
    // PGlite runs these one at a time; tests/concurrency.pg.test.ts repeats this
    // with real parallel connections when TEST_DATABASE_URL is set.
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        svc.rpc("create_payment", {
          p_idempotency_key: key(),
          p_user_id: null,
          p_direction: "payout",
          p_provider: "sandbox",
          p_amount: 10_000,
          p_currency: "XOF",
          p_ledger_account_id: pot,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(await balance(pot)).toBe(0);
    for (const { net } of await netPerCurrency()) expect(net).toBe(0);
  });
});
