import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db";
import { DEMO, TestDb } from "./harness";

let db: TestDb;
let svc: Db;
const extra: string[] = [];

type Q = { query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> };
const as = <T>(user: string, fn: (q: Q) => Promise<T>) => db.asUser(user, fn as never) as Promise<T>;
const scalar = async <T>(user: string, sql: string, params: unknown[] = []) =>
  as(user, async (q) => (await q.query<{ v: T }>(sql, params)).rows[0].v);

async function newUser(name: string) {
  const id = randomUUID();
  await db.pg.query("insert into auth.users (id, phone, raw_user_meta_data) values ($1, $2, $3)", [
    id,
    `22507${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
    JSON.stringify({ full_name: name }),
  ]);
  await db.pg.query("update public.profiles set kyc_tier = 2 where id = $1", [id]);
  extra.push(id);
  return id;
}

const createGroup = (user: string, overrides: Partial<Record<string, unknown>> = {}) => {
  const p = {
    name: "Tontine test",
    amount: 10_000,
    frequency: "weekly",
    start: new Date().toISOString().slice(0, 10),
    limit: 10,
    order: "fixed",
    grace: 2,
    penalty: 500,
    ...overrides,
  };
  return scalar<string>(user, "select public.create_group($1, $2, $3, $4, $5, $6, $7, $8) as v", [
    p.name, p.amount, p.frequency, p.start, p.limit, p.order, p.grace, p.penalty,
  ]);
};
const inviteCode = async (groupId: string) =>
  (await db.one<{ invite_code: string }>("select invite_code from public.groups where id = $1", [groupId])).invite_code;
const join = (user: string, code: string) => scalar<string>(user, "select public.join_group($1) as v", [code]);
const start = (user: string, groupId: string) => as(user, (q) => q.query("select public.start_group($1)", [groupId]));

beforeAll(async () => {
  db = await TestDb.create();
  svc = db.serviceDb();
}, 120_000);

afterAll(() => db?.close());

describe("create, join and start", () => {
  it("validates the group on creation", async () => {
    await expect(createGroup(DEMO.awa, { amount: 100 })).rejects.toThrow(/between 500/);
    await expect(createGroup(DEMO.awa, { start: "2020-01-01" })).rejects.toThrow(/past/);
    await expect(createGroup(DEMO.awa, { penalty: 20_000 })).rejects.toThrow(/late penalty/);
  });

  it("the creator becomes the manager of a draft group with its rules", async () => {
    const id = await createGroup(DEMO.awa, { name: "  Les Amies  " });
    const row = await db.one("select name, status, manager_id from public.groups where id = $1", [id]);
    expect(row).toEqual({ name: "Les Amies", status: "draft", manager_id: DEMO.awa });
    expect(await db.one("select grace_days, late_penalty_amount from public.group_rules where group_id = $1", [id])).toEqual({
      grace_days: 2,
      late_penalty_amount: 500,
    });
  });

  it("invite preview, joining (twice is fine), limit and started groups", async () => {
    const id = await createGroup(DEMO.awa, { limit: 2 });
    const code = await inviteCode(id);
    const preview = await as(DEMO.koffi, (q) =>
      q.query<{ name: string; member_count: number; manager_name: string; already_member: boolean }>(
        "select name, member_count, manager_name, already_member from public.group_invite_preview($1)",
        [code.toUpperCase()],
      ),
    );
    expect(preview.rows).toEqual([{ name: "Tontine test", member_count: 1, manager_name: "Awa Koné", already_member: false }]);

    expect(await join(DEMO.koffi, code)).toBe(id);
    expect(await join(DEMO.koffi, code)).toBe(id);
    await expect(join(DEMO.aminata, code)).rejects.toThrow(/group_full/);
    await expect(join(DEMO.aminata, "nope")).rejects.toThrow(/invite_not_found/);
  });

  it("only the manager starts, with at least 2 members; fixed order follows joining", async () => {
    const id = await createGroup(DEMO.awa);
    await expect(start(DEMO.awa, id)).rejects.toThrow(/not_enough_members/);
    const code = await inviteCode(id);
    const b = await newUser("Bintou");
    await join(DEMO.koffi, code);
    await join(b, code);
    await expect(start(DEMO.koffi, id)).rejects.toThrow(/only the manager/);
    await start(DEMO.awa, id);

    const order = await db.all<{ user_id: string; payout_position: number }>(
      "select user_id, payout_position from public.group_members where group_id = $1 order by payout_position",
      [id],
    );
    expect(order.map((o) => o.user_id)).toEqual([DEMO.awa, DEMO.koffi, b]);
    const cycle = await db.one<{ number: number; recipient_id: string; status: string }>(
      "select number, recipient_id, status from public.cycles where group_id = $1",
      [id],
    );
    expect(cycle).toEqual({ number: 1, recipient_id: DEMO.awa, status: "collecting" });
    await expect(join(DEMO.aminata, code)).rejects.toThrow(/group_started/);
  });

  it("lottery order is a permutation of the members", async () => {
    const id = await createGroup(DEMO.awa, { order: "lottery" });
    const code = await inviteCode(id);
    const members = [DEMO.awa, DEMO.koffi, await newUser("C"), await newUser("D"), await newUser("E")];
    for (const m of members.slice(1)) await join(m, code);
    await start(DEMO.awa, id);
    const positions = await db.all<{ payout_position: number }>(
      "select payout_position from public.group_members where group_id = $1 order by payout_position",
      [id],
    );
    expect(positions.map((p) => p.payout_position)).toEqual([1, 2, 3, 4, 5]);
  });

  it("my_groups shows amount, my position and the next due date", async () => {
    const groups = await as(DEMO.koffi, (q) =>
      q.query<{ name: string; my_position: number | null; status: string; next_due_date: string | Date }>(
        "select name, my_position, status, next_due_date from public.my_groups()",
      ),
    );
    expect(groups.rows.length).toBeGreaterThanOrEqual(3);
    expect(groups.rows.some((g) => g.status === "active" && g.my_position === 2)).toBe(true);
  });
});

describe("paying a share", () => {
  let groupId: string;
  let cycleId: string;
  let pot: string;

  beforeAll(async () => {
    await db.pg.query("update public.profiles set kyc_tier = 2 where id = any($1)", [[DEMO.awa, DEMO.koffi, DEMO.aminata]]);
    groupId = await createGroup(DEMO.awa, { name: "Paiement test" });
    const code = await inviteCode(groupId);
    await join(DEMO.koffi, code);
    await start(DEMO.awa, groupId);
    // Aminata sponsors Koffi (Phase 8 adds this through Payer pour).
    await db.pg.query(
      "insert into public.group_members (group_id, user_id, role, sponsored_member_id) values ($1, $2, 'sponsor', $3)",
      [groupId, DEMO.aminata, DEMO.koffi],
    );
    cycleId = (await db.one<{ id: string }>("select id from public.cycles where group_id = $1", [groupId])).id;
    pot = await svc.rpc<string>("ensure_ledger_account", { p_owner_type: "group", p_owner_id: groupId, p_currency: "XOF" });
  });

  async function pay(member: string, paidBy: string) {
    const c = await svc.rpc<{ id: string; amount: number }>("create_contribution", {
      p_cycle_id: cycleId,
      p_member_id: member,
      p_paid_by: paidBy,
    });
    const p = await svc.rpc<{ id: string }>("create_payment", {
      p_idempotency_key: `contribution:${c.id}`,
      p_user_id: paidBy,
      p_direction: "collect",
      p_provider: "sandbox",
      p_amount: c.amount,
      p_currency: "XOF",
      p_ledger_account_id: pot,
      p_purpose_type: "contribution",
      p_purpose_id: c.id,
    });
    await db.pg.query("update public.payments set provider_ref = $1 where id = $2", [`sbx_test_${p.id}`, p.id]);
    return { contribution: c, payment: p };
  }

  const status = (user: string) =>
    as(user, (q) =>
      q.query<{ full_name: string; paid_current: boolean; is_recipient: boolean }>(
        "select full_name, paid_current, is_recipient from public.group_members_status($1) where role <> 'sponsor'",
        [groupId],
      ),
    );

  it("a payment links to its contribution and settles it; the group sees who paid", async () => {
    const { contribution, payment } = await pay(DEMO.awa, DEMO.awa);
    expect((await db.one("select payment_id, status from public.contributions where id = $1", [contribution.id]))).toEqual({
      payment_id: payment.id,
      status: "pending",
    });
    await svc.rpc("settle_payment", { p_payment_id: payment.id, p_status: "succeeded" });
    expect((await db.one<{ status: string }>("select status from public.contributions where id = $1", [contribution.id])).status).toBe(
      "succeeded",
    );
    expect((await status(DEMO.koffi)).rows).toEqual([
      { full_name: "Awa Koné", paid_current: true, is_recipient: true },
      { full_name: "Koffi Yao", paid_current: false, is_recipient: false },
    ]);
    expect(await svc.rpc<number>("account_balance", { p_account_id: pot })).toBe(10_000);
  });

  it("a paid share cannot be paid again; a pending one is reused", async () => {
    await expect(
      svc.rpc("create_contribution", { p_cycle_id: cycleId, p_member_id: DEMO.awa, p_paid_by: DEMO.awa }),
    ).rejects.toThrow(/already_paid/);
    const a = await svc.rpc<{ id: string }>("create_contribution", { p_cycle_id: cycleId, p_member_id: DEMO.koffi, p_paid_by: DEMO.koffi });
    const b = await svc.rpc<{ id: string }>("create_contribution", { p_cycle_id: cycleId, p_member_id: DEMO.koffi, p_paid_by: DEMO.koffi });
    expect(b.id).toBe(a.id);
  });

  it("a sponsor pays for their member; strangers cannot", async () => {
    const outsider = await newUser("Inconnu");
    await expect(
      svc.rpc("create_contribution", { p_cycle_id: cycleId, p_member_id: DEMO.koffi, p_paid_by: outsider }),
    ).rejects.toThrow(/only the member or their sponsor/);
    // Reuses Koffi's pending contribution created above, now paid by Aminata.
    const c = await svc.rpc<{ id: string }>("create_contribution", { p_cycle_id: cycleId, p_member_id: DEMO.koffi, p_paid_by: DEMO.aminata });
    expect(c.id).toBeTruthy();
  });

  it("a failed payment marks the contribution failed so the member can retry", async () => {
    const outsiderGroup = await createGroup(DEMO.awa, { name: "Echec test" });
    await join(DEMO.koffi, await inviteCode(outsiderGroup));
    await start(DEMO.awa, outsiderGroup);
    const cyc = (await db.one<{ id: string }>("select id from public.cycles where group_id = $1", [outsiderGroup])).id;
    const potB = await svc.rpc<string>("ensure_ledger_account", { p_owner_type: "group", p_owner_id: outsiderGroup, p_currency: "XOF" });
    const c = await svc.rpc<{ id: string }>("create_contribution", { p_cycle_id: cyc, p_member_id: DEMO.koffi, p_paid_by: DEMO.koffi });
    const p = await svc.rpc<{ id: string }>("create_payment", {
      p_idempotency_key: `contribution:${c.id}`, p_user_id: DEMO.koffi, p_direction: "collect", p_provider: "sandbox",
      p_amount: 10_000, p_currency: "XOF", p_ledger_account_id: potB, p_purpose_type: "contribution", p_purpose_id: c.id,
    });
    await svc.rpc("settle_payment", { p_payment_id: p.id, p_status: "failed", p_failure_code: "INSUFFICIENT_FUNDS" });
    expect((await db.one<{ status: string }>("select status from public.contributions where id = $1", [c.id])).status).toBe("failed");
    const retry = await svc.rpc<{ id: string }>("create_contribution", { p_cycle_id: cyc, p_member_id: DEMO.koffi, p_paid_by: DEMO.koffi });
    expect(retry.id).not.toBe(c.id);
  });

  it("the group ledger shows who paid, for which round, with the rail reference; outsiders see nothing", async () => {
    const rows = await as(DEMO.koffi, (q) =>
      q.query<{ kind: string; side: string; amount: number; member_name: string; cycle_number: number; rail_reference: string }>(
        "select kind, side, amount, member_name, cycle_number, rail_reference from public.group_ledger($1)",
        [groupId],
      ),
    );
    expect(rows.rows).toEqual([
      { kind: "collect", side: "credit", amount: 10_000, member_name: "Awa Koné", cycle_number: 1, rail_reference: expect.stringMatching(/^sbx_test_/) },
    ]);
    const outsider = await newUser("Curieux");
    const none = await as(outsider, (q) => q.query("select * from public.group_ledger($1)", [groupId]));
    expect(none.rows).toEqual([]);
  });

  it("users cannot create contributions themselves", async () => {
    await expect(
      as(DEMO.koffi, (q) => q.query("select public.create_contribution($1, $2, $2)", [cycleId, DEMO.koffi])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("rule changes", () => {
  const propose = (user: string, groupId: string, grace: number, penalty: number) =>
    scalar<string>(user, "select public.propose_group_rules($1, $2, $3) as v", [groupId, grace, penalty]);
  const vote = (user: string, proposalId: string, approve: boolean) =>
    scalar<string>(user, "select public.vote_group_rules($1, $2) as v", [proposalId, approve]);
  const rules = (groupId: string) =>
    db.one<{ grace_days: number; late_penalty_amount: number }>(
      "select grace_days, late_penalty_amount from public.group_rules where group_id = $1",
      [groupId],
    );
  const openProposal = async (groupId: string) =>
    (await db.one<{ id: string }>("select id from public.group_rule_proposals where group_id = $1 and status = 'open'", [groupId])).id;

  it("before the start only the manager edits, and it applies at once", async () => {
    const id = await createGroup(DEMO.awa);
    await join(DEMO.koffi, await inviteCode(id));
    await expect(propose(DEMO.koffi, id, 5, 0)).rejects.toThrow(/only the manager/);
    expect(await propose(DEMO.awa, id, 5, 1_000)).toBe("applied");
    expect(await rules(id)).toEqual({ grace_days: 5, late_penalty_amount: 1_000 });
  });

  it("after the start a change needs a majority of the rotation", async () => {
    const id = await createGroup(DEMO.awa);
    const code = await inviteCode(id);
    const c = await newUser("Chantal");
    await join(DEMO.koffi, code);
    await join(c, code);
    await start(DEMO.awa, id);

    expect(await propose(DEMO.koffi, id, 3, 750)).toBe("open"); // 1 of 3
    await expect(propose(DEMO.awa, id, 4, 0)).rejects.toThrow(/proposal_open/);
    expect(await rules(id)).toEqual({ grace_days: 2, late_penalty_amount: 500 });

    const proposal = await openProposal(id);
    expect(await vote(c, proposal, true)).toBe("approved"); // 2 of 3
    expect(await rules(id)).toEqual({ grace_days: 3, late_penalty_amount: 750 });
    await expect(vote(DEMO.awa, proposal, false)).rejects.toThrow(/proposal_closed/);
  });

  it("a proposal is rejected once a majority can no longer be reached", async () => {
    const id = await createGroup(DEMO.awa);
    await join(DEMO.koffi, await inviteCode(id));
    await start(DEMO.awa, id);
    expect(await propose(DEMO.koffi, id, 10, 0)).toBe("open"); // 1 of 2 is not a majority
    expect(await vote(DEMO.awa, await openProposal(id), false)).toBe("rejected");
    expect(await rules(id)).toEqual({ grace_days: 2, late_penalty_amount: 500 });
  });

  it("outsiders cannot propose or vote", async () => {
    const id = await createGroup(DEMO.awa);
    await join(DEMO.koffi, await inviteCode(id));
    await start(DEMO.awa, id);
    await propose(DEMO.awa, id, 1, 0);
    await expect(propose(DEMO.aminata, id, 1, 0)).rejects.toThrow(/only members/);
    await expect(vote(DEMO.aminata, await openProposal(id), true)).rejects.toThrow(/only members/);
  });
});
