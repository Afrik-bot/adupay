// Security invariants from the Phase 14 review, checked against the real migrations.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO, TestDb } from "./harness";

let db: TestDb;

beforeAll(async () => {
  db = await TestDb.create();
}, 120_000);

afterAll(() => db?.close());

/** Functions a signed-out visitor may call. Anything new here must be reviewed. */
const ANON_ALLOWED = ["directed_payment_public", "kyc_daily_limit_xof", "xof_equivalent"];

describe("database surface", () => {
  it("every public table has row-level security", async () => {
    const rows = await db.all<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("signed-out visitors have no table access and only reviewed functions", async () => {
    const tables = await db.all(`select table_name from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'`);
    expect(tables).toEqual([]);
    const fns = await db.all<{ proname: string }>(
      `select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`,
    );
    expect(fns.map((f) => f.proname)).toEqual(ANON_ALLOWED);
  });

  it("every SECURITY DEFINER function pins its search_path", async () => {
    const rows = await db.all<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    );
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it("server-only money and queue functions are not callable by signed-in users", async () => {
    for (const fn of ["post_ledger_transaction", "create_payment", "settle_payment", "claim_notifications", "hit_rate_limit", "create_contribution"]) {
      const ok = await db.one<{ ok: boolean }>(
        `select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) as ok
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`,
        [fn],
      );
      expect(ok.ok, fn).toBe(false);
    }
  });
});

describe("sensitive columns", () => {
  it("payout tokens and reviewers of payees are hidden from signed-in users", async () => {
    await expect(db.asUser(DEMO.koffi, (q) => q.query("select payout_account_token from public.payees limit 1"))).rejects.toThrow(/permission denied/);
    await expect(db.asUser(DEMO.koffi, (q) => q.query("select reviewed_by from public.payees limit 1"))).rejects.toThrow(/permission denied/);
    await expect(db.asUser(DEMO.koffi, (q) => q.query("select * from public.payees limit 1"))).rejects.toThrow(/permission denied/);
    const rows = await db.asUser(DEMO.koffi, async (q) => (await q.query<{ name: string }>("select id, name, payout_account_masked from public.payees")).rows);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("nobody but staff can read a sanctions flag, not even their own", async () => {
    await expect(db.asUser(DEMO.koffi, (q) => q.query("select sanctions_status from public.profiles where id = $1", [DEMO.koffi]))).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.asUser(DEMO.koffi, (q) => q.query("select sanctions_status from public.payees limit 1"))).rejects.toThrow(/permission denied/);
    await expect(db.asUser(DEMO.koffi, (q) => q.query("select * from public.admin_sanctions_flags(array[$1::uuid], '{}')", [DEMO.koffi]))).rejects.toThrow(/staff only/);
    const own = await db.asUser(DEMO.koffi, async (q) => (await q.query<{ full_name: string }>("select full_name, kyc_tier from public.profiles where id = $1", [DEMO.koffi])).rows);
    expect(own[0].full_name).toBe("Koffi Yao");
  });

  it("staff see flags through admin_sanctions_flags", async () => {
    await db.pg.query("insert into public.user_roles (user_id, role) values ($1, 'admin') on conflict do nothing", [DEMO.awa]);
    await db.pg.query("update public.profiles set sanctions_status = 'hit' where id = $1", [DEMO.aminata]);
    const flags = await db.asUser(DEMO.awa, async (q) =>
      (
        await q.query<{ subject: string; id: string; sanctions_status: string }>(
          "select * from public.admin_sanctions_flags(array[$1::uuid, $2::uuid], '{}')",
          [DEMO.aminata, DEMO.koffi],
        )
      ).rows,
    );
    expect(flags.find((f) => f.id === DEMO.aminata)?.sanctions_status).toBe("hit");
    expect(flags.find((f) => f.id === DEMO.koffi)?.sanctions_status).toBe("clear");
  });
});

describe("rate limiter", () => {
  it("allows up to the limit in a window, then refuses until the window passes", async () => {
    const svc = db.serviceDb();
    const hit = () => svc.rpc<boolean>("hit_rate_limit", { p_key: "payment:test", p_max: 3, p_window_seconds: 600 });
    expect([await hit(), await hit(), await hit(), await hit()]).toEqual([true, true, true, false]);
    await db.pg.query("update public.rate_limits set window_start = now() - interval '11 minutes' where key = 'payment:test'");
    expect(await hit()).toBe(true);
  });

  it("users cannot call or read it", async () => {
    await expect(db.userDb(DEMO.koffi).rpc("hit_rate_limit", { p_key: "x", p_max: 1, p_window_seconds: 1 })).rejects.toThrow(/permission denied/);
    await expect(db.asUser(DEMO.koffi, (q) => q.query("select * from public.rate_limits"))).rejects.toThrow(/permission denied/);
  });
});
