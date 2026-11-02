// True parallel-connection test of the ledger locks. PGlite has one connection,
// so this needs a real, EMPTY Postgres database (it installs the schema):
//   $env:TEST_DATABASE_URL = "postgres://postgres:postgres@localhost:54329/adupay_test"; npm run test:db
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { migrationSql, shimSql } from "./harness";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("ledger under real concurrency", () => {
  let pool: pg.Pool;
  let pot: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 20 });
    await pool.query(shimSql());
    for (const sql of migrationSql()) await pool.query(sql);
    pot = (
      await pool.query<{ id: string }>("select public.ensure_ledger_account('group', $1, 'XOF') as id", [randomUUID()])
    ).rows[0].id;
    const payment = await pool.query<{ id: string }>(
      "select id from public.create_payment($1, null, 'collect', 'sandbox', 50000, 'XOF', $2)",
      [randomUUID(), pot],
    );
    await pool.query("select public.settle_payment($1, 'succeeded')", [payment.rows[0].id]);
  }, 60_000);

  afterAll(() => pool?.end());

  it("40 parallel payouts of 10 000 from a 50 000 pot: exactly 5 succeed", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 40 }, () =>
        pool.query("select id from public.create_payment($1, null, 'payout', 'sandbox', 10000, 'XOF', $2)", [
          randomUUID(),
          pot,
        ]),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    const balance = await pool.query<{ b: string }>("select public.account_balance($1) as b", [pot]);
    expect(Number(balance.rows[0].b)).toBe(0);
  });

  it("parallel retries of one idempotency key post exactly once", async () => {
    const key = randomUUID();
    const payment = await pool.query<{ id: string }>(
      "select id from public.create_payment($1, null, 'collect', 'sandbox', 1000, 'XOF', $2)",
      [randomUUID(), pot],
    );
    await pool.query("select public.settle_payment($1, 'succeeded')", [payment.rows[0].id]);
    const settlement = (await pool.query<{ id: string }>("select public.system_account('partner_settlement', 'XOF') as id"))
      .rows[0].id;
    const entries = JSON.stringify([
      { account_id: pot, side: "debit", amount: 1000 },
      { account_id: settlement, side: "credit", amount: 1000 },
    ]);
    const ids = await Promise.all(
      Array.from({ length: 20 }, () =>
        pool.query<{ id: string }>("select public.post_ledger_transaction($1, 'test', $2::jsonb) as id", [key, entries]),
      ),
    );
    expect(new Set(ids.map((r) => r.rows[0].id)).size).toBe(1);
    const count = await pool.query<{ n: string }>(
      "select count(*) as n from public.ledger_entries e join public.ledger_transactions t on t.id = e.transaction_id where t.idempotency_key = $1",
      [key],
    );
    expect(Number(count.rows[0].n)).toBe(2);
  });
});
