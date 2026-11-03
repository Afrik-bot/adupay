import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO, TestDb } from "./harness";

let db: TestDb;

beforeAll(async () => {
  db = await TestDb.create();
  // These tests are about the ledger, not KYC limits (see kyc.test.ts).
  await db.pg.query("update public.profiles set kyc_tier = 2");
  const svc = db.serviceDb();
  // Give Awa and Koffi a wallet with money so there is ledger data to hide.
  for (const user of [DEMO.awa, DEMO.koffi]) {
    const wallet = await svc.rpc<string>("ensure_ledger_account", { p_owner_type: "user", p_owner_id: user, p_currency: "XOF" });
    const payment = await svc.rpc<{ id: string }>("create_payment", {
      p_idempotency_key: `seed-topup-${user}`,
      p_user_id: user,
      p_direction: "collect",
      p_provider: "sandbox",
      p_amount: 50000,
      p_currency: "XOF",
      p_ledger_account_id: wallet,
    });
    await svc.rpc("settle_payment", { p_payment_id: payment.id, p_status: "succeeded" });
  }
  await db.pg.query(
    `insert into public.linked_accounts (user_id, provider, account_masked, account_ref_hash)
     values ($1, 'orange_money', '•••• 0001', 'h1'), ($2, 'wave', '•••• 0002', 'h2')`,
    [DEMO.awa, DEMO.koffi],
  );
  await db.pg.query(
    `insert into public.kyc_records (user_id, tier_requested, document_type) values ($1, 1, 'cni'), ($2, 1, 'passport')`,
    [DEMO.koffi, DEMO.aminata],
  );
  await db.pg.query(`insert into public.notifications (user_id, template) values ($1, 'welcome'), ($2, 'welcome')`, [
    DEMO.koffi,
    DEMO.aminata,
  ]);
}, 60_000);

afterAll(() => db?.close());

const ids = (rows: { id?: string; user_id?: string }[]) => rows.map((r) => r.id ?? r.user_id).sort();

describe("anon", () => {
  it("cannot read any table", async () => {
    for (const table of ["profiles", "groups", "payees", "ledger_entries", "payments", "audit_log"]) {
      await expect(db.as({ role: "anon" }, (q) => q.query(`select * from public.${table}`)), table).rejects.toThrow(
        /permission denied/,
      );
    }
  });
});

describe("profiles", () => {
  it("a user sees themselves and people in their groups only", async () => {
    // Aminata shares the Yopougon group with Koffi, but no group with Awa.
    const rows = await db.asUser(DEMO.aminata, (q) => q.query<{ id: string }>("select id from public.profiles"));
    expect(ids(rows.rows)).toEqual([DEMO.koffi, DEMO.aminata].sort());
  });

  it("a user cannot change their own KYC tier", async () => {
    await expect(
      db.asUser(DEMO.koffi, (q) => q.query("update public.profiles set kyc_tier = 2 where id = $1", [DEMO.koffi])),
    ).rejects.toThrow(/permission denied/);
  });

  it("a user cannot update someone else's profile", async () => {
    const result = await db.asUser(DEMO.koffi, (q) =>
      q.query("update public.profiles set full_name = 'x' where id = $1", [DEMO.awa]),
    );
    expect(result.affectedRows).toBe(0);
  });
});

describe("own-data tables", () => {
  it.each([
    ["linked_accounts", DEMO.koffi, 1],
    ["kyc_records", DEMO.koffi, 1],
    ["notifications", DEMO.koffi, 1],
    ["payments", DEMO.koffi, 1],
  ])("%s: Koffi sees only his own rows", async (table, user, expected) => {
    const rows = await db.asUser(user, (q) => q.query<{ user_id: string }>(`select user_id from public.${table}`));
    expect(rows.rows).toHaveLength(expected);
    expect(rows.rows.every((r) => r.user_id === user)).toBe(true);
  });

  it("a user cannot insert a row for someone else", async () => {
    await expect(
      db.asUser(DEMO.koffi, (q) =>
        q.query(
          `insert into public.linked_accounts (user_id, provider, account_masked, account_ref_hash) values ($1, 'wave', 'x', 'y')`,
          [DEMO.awa],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("a user cannot self-approve KYC", async () => {
    await expect(
      db.asUser(DEMO.koffi, (q) =>
        q.query(
          `insert into public.kyc_records (user_id, tier_requested, document_type, status) values ($1, 2, 'cni', 'approved')`,
          [DEMO.koffi],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("groups", () => {
  it("members see their groups, outsiders do not", async () => {
    const forKoffi = await db.asUser(DEMO.koffi, (q) => q.query<{ id: string }>("select id from public.groups"));
    expect(ids(forKoffi.rows)).toEqual([DEMO.adjameGroup, DEMO.yopougonGroup].sort());
    const forAminata = await db.asUser(DEMO.aminata, (q) => q.query<{ id: string }>("select id from public.groups"));
    expect(ids(forAminata.rows)).toEqual([DEMO.yopougonGroup]);
  });

  it("outsiders cannot see a group's members or cycles", async () => {
    const members = await db.asUser(DEMO.aminata, (q) =>
      q.query("select * from public.group_members where group_id = $1", [DEMO.adjameGroup]),
    );
    expect(members.rows).toHaveLength(0);
    const cycles = await db.asUser(DEMO.aminata, (q) =>
      q.query("select * from public.cycles where group_id = $1", [DEMO.adjameGroup]),
    );
    expect(cycles.rows).toHaveLength(0);
  });

  it("users cannot add themselves to a group directly", async () => {
    await expect(
      db.asUser(DEMO.aminata, (q) =>
        q.query("insert into public.group_members (group_id, user_id) values ($1, $2)", [DEMO.adjameGroup, DEMO.aminata]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("ledger and money", () => {
  it("a user sees only their own ledger accounts and entries", async () => {
    const accounts = await db.asUser(DEMO.koffi, (q) =>
      q.query<{ owner_id: string; owner_type: string }>("select owner_id, owner_type from public.ledger_accounts"),
    );
    expect(accounts.rows).toEqual([{ owner_id: DEMO.koffi, owner_type: "user" }]);

    const entries = await db.asUser(DEMO.koffi, (q) => q.query<{ amount: number }>("select amount from public.ledger_entries"));
    expect(entries.rows).toEqual([{ amount: 50000 }]);
  });

  it("my_balances returns only the caller's balance", async () => {
    const rows = await db.asUser(DEMO.aminata, (q) => q.query("select * from public.my_balances()"));
    expect(rows.rows).toEqual([]);
    const koffi = await db.asUser(DEMO.koffi, (q) => q.query("select * from public.my_balances()"));
    expect(koffi.rows).toEqual([{ currency: "XOF", balance: 50000 }]);
  });

  it("users cannot write to the ledger or call money functions", async () => {
    await expect(
      db.asUser(DEMO.koffi, (q) =>
        q.query("insert into public.ledger_transactions (idempotency_key, kind) values ('hack-0001', 'x')"),
      ),
    ).rejects.toThrow(/permission denied/);

    const userDb = db.userDb(DEMO.koffi);
    await expect(
      userDb.rpc("post_ledger_transaction", { p_idempotency_key: "hack-0002", p_kind: "x", p_entries: [] }),
    ).rejects.toThrow(/permission denied/);
    await expect(
      userDb.rpc("settle_payment", { p_payment_id: DEMO.awa, p_status: "succeeded" }),
    ).rejects.toThrow(/permission denied/);
  });

  it("risk events and the audit log are admin-only", async () => {
    await db.pg.query(`insert into public.risk_events (kind) values ('test')`);
    await db.pg.query(`insert into public.audit_log (action) values ('test')`);
    for (const table of ["risk_events", "audit_log"]) {
      const asKoffi = await db.asUser(DEMO.koffi, (q) => q.query(`select * from public.${table}`));
      expect(asKoffi.rows, table).toHaveLength(0);
      const asAdmin = await db.asUser(DEMO.awa, (q) => q.query(`select * from public.${table}`));
      expect(asAdmin.rows.length, table).toBeGreaterThan(0);
    }
  });
});

describe("payees", () => {
  it("the verified directory has the 8 seeded Abidjan payees", async () => {
    const rows = await db.asUser(DEMO.aminata, (q) =>
      q.query<{ category: string; n: number }>(
        "select category, count(*)::int as n from public.payees group by category order by category",
      ),
    );
    expect(rows.rows).toEqual([
      { category: "school", n: 2 },
      { category: "clinic", n: 2 },
      { category: "pharmacy", n: 2 },
      { category: "utility", n: 2 },
    ]);
  });

  it("unverified payees are hidden from other users", async () => {
    await db.pg.query(
      `insert into public.payees (name, category, city, owner_id, kyb_status) values ('Pending school', 'school', 'Abidjan', $1, 'pending')`,
      [DEMO.koffi],
    );
    const others = await db.asUser(DEMO.aminata, (q) => q.query("select * from public.payees where kyb_status = 'pending'"));
    expect(others.rows).toHaveLength(0);
    const owner = await db.asUser(DEMO.koffi, (q) => q.query("select * from public.payees where kyb_status = 'pending'"));
    expect(owner.rows).toHaveLength(1);
  });
});
