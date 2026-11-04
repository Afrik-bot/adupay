// Épargne and Score Communauté through the real migrations (PGlite) and the sandbox rail.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO, TestDb } from "../../supabase/tests/harness";
import { SandboxProvider } from "./payments/sandbox";
import { PaymentService } from "./payments/service";
import { runSavingsTopups, topUpGoal, withdrawFromGoal } from "./savings";

let db: TestDb;
let service: PaymentService;
let now = Date.now();
const timers: { at: number; fn: () => void }[] = [];
const webhooks: { body: string; headers: Record<string, string> }[] = [];

async function railSettles() {
  now += 20_000;
  for (const t of timers.filter((t) => t.at <= now)) {
    timers.splice(timers.indexOf(t), 1);
    t.fn();
  }
  for (const w of webhooks.splice(0)) await service.handleWebhook(w.body, new Headers(w.headers));
}

const today = new Date().toISOString().slice(0, 10);
const inDays = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function createGoal(user: string, fields: Record<string, unknown> = {}) {
  const goal = { name: "Rentrée scolaire", kind: "school", target_amount: 100_000, lock_until: null, weekly_topup_amount: null, ...fields };
  return db.asUser(user, async (q) =>
    (
      await q.query<{ id: string }>(
        `insert into public.savings_goals (user_id, name, kind, target_amount, lock_until, weekly_topup_amount)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [user, goal.name, goal.kind, goal.target_amount, goal.lock_until, goal.weekly_topup_amount],
      )
    ).rows[0].id,
  );
}
const balanceOf = async (user: string, goalId: string) =>
  (await db.asUser(user, async (q) => (await q.query<{ id: string; balance: number }>("select id, balance from public.my_goals()")).rows)).find(
    (g) => g.id === goalId,
  )?.balance;
const move = (fn: typeof topUpGoal, user: string, goalId: string, amount: number) =>
  fn(db.serviceDb(), service, { userId: user, goalId, currency: "XOF", amount, requestKey: randomUUID() });

beforeAll(async () => {
  db = await TestDb.create();
  await db.pg.query("update public.profiles set kyc_tier = 2 where id = any($1)", [[DEMO.awa, DEMO.koffi]]);
  for (const user of [DEMO.awa, DEMO.koffi]) {
    await db.pg.query(
      `insert into public.linked_accounts (user_id, provider, account_masked, account_ref_hash, is_default, verified_at, account_token)
       values ($1, 'wave', '•••• 9990', $2, true, now(), 'sbxacct_test_9990')`,
      [user, randomUUID()],
    );
  }
  service = new PaymentService(
    db.serviceDb(),
    new SandboxProvider({
      secret: "test-secret-at-least-16",
      now: () => now,
      schedule: (fn, ms) => void timers.push({ at: now + ms, fn }),
      deliver: async (body, headers) => void webhooks.push({ body, headers }),
    }),
  );
}, 120_000);

afterAll(() => db?.close());

describe("savings goals", () => {
  it("a top-up lands in the goal's own account once the rail confirms", async () => {
    const goal = await createGoal(DEMO.awa);
    expect(await balanceOf(DEMO.awa, goal)).toBe(0);
    expect(await move(topUpGoal, DEMO.awa, goal, 25_000)).toHaveProperty("paymentId");
    expect(await balanceOf(DEMO.awa, goal)).toBe(0); // pending
    await railSettles();
    expect(await balanceOf(DEMO.awa, goal)).toBe(25_000);
  });

  it("only the owner can pay into or out of a goal", async () => {
    const goal = await createGoal(DEMO.awa);
    expect(await move(topUpGoal, DEMO.koffi, goal, 1_000)).toEqual({ error: "notOwner" });
    expect(await move(withdrawFromGoal, DEMO.koffi, goal, 1_000)).toEqual({ error: "notOwner" });
  });

  it("a locked goal cannot be emptied early — enforced in create_payment", async () => {
    const goal = await createGoal(DEMO.awa, { name: "Tabaski", kind: "tabaski", lock_until: inDays(30) });
    await move(topUpGoal, DEMO.awa, goal, 40_000);
    await railSettles();
    expect(await move(withdrawFromGoal, DEMO.awa, goal, 10_000)).toEqual({ error: "goalLocked" });
    expect(await balanceOf(DEMO.awa, goal)).toBe(40_000);

    // Once the lock date passes, withdrawals work.
    await db.pg.query("update public.savings_goals set lock_until = current_date where id = $1", [goal]);
    expect(await move(withdrawFromGoal, DEMO.awa, goal, 10_000)).toHaveProperty("paymentId");
    expect(await balanceOf(DEMO.awa, goal)).toBe(30_000); // reserved at once
    await railSettles();
    expect(await balanceOf(DEMO.awa, goal)).toBe(30_000);
  });

  it("cannot withdraw more than the goal holds, and nothing is written", async () => {
    const goal = await createGoal(DEMO.koffi, { name: "Loyer", kind: "rent" });
    await move(topUpGoal, DEMO.koffi, goal, 5_000);
    await railSettles();
    const before = await db.one<{ n: number }>("select count(*)::int as n from public.payments");
    expect(await move(withdrawFromGoal, DEMO.koffi, goal, 6_000)).toEqual({ error: "insufficient" });
    expect(await db.one("select count(*)::int as n from public.payments")).toEqual(before);
  });

  it("weekly auto top-ups run once per week and move to the next week", async () => {
    const goal = await createGoal(DEMO.koffi, { name: "Moto", kind: "custom", weekly_topup_amount: 2_000 });
    await db.asUser(DEMO.koffi, (q) =>
      q.query("update public.savings_goals set auto_topup = true, next_topup_on = $2 where id = $1", [goal, today]),
    );
    expect((await runSavingsTopups(db.serviceDb(), service, today)).ran).toBe(1);
    expect((await runSavingsTopups(db.serviceDb(), service, today)).ran).toBe(0);
    await railSettles();
    expect(await balanceOf(DEMO.koffi, goal)).toBe(2_000);
    const next = await db.one<{ next_topup_on: Date }>("select next_topup_on from public.savings_goals where id = $1", [goal]);
    expect(next.next_topup_on.toISOString().slice(0, 10)).toBe(inDays(7));
  });

  it("users cannot see someone else's goals or their balance", async () => {
    const mine = await db.asUser(DEMO.aminata, async (q) => (await q.query("select * from public.my_goals()")).rows);
    expect(mine).toEqual([]);
    const theirs = await db.asUser(DEMO.aminata, async (q) => (await q.query("select * from public.savings_goals")).rows);
    expect(theirs).toEqual([]);
  });
});

describe("score inputs and consent", () => {
  it("counts real activity: savings weeks and account age", async () => {
    const [inputs] = await db.asUser(DEMO.koffi, async (q) =>
      (await q.query<Record<string, number>>("select * from public.my_score_inputs()")).rows,
    );
    expect(inputs).toMatchObject({ contributions_total: 0, cycles_completed: 0, savings_weeks: 1 });
    expect(inputs.account_age_days).toBeGreaterThanOrEqual(0);
    await expect(db.asUser(DEMO.koffi, (q) => q.query("select * from public.score_inputs($1)", [DEMO.awa]))).rejects.toThrow(/permission denied/);
  });

  it("one active consent at a time; revoking keeps the history", async () => {
    const grant = () => db.asUser(DEMO.koffi, (q) => q.query("insert into public.consents (user_id, purpose) values ($1, 'credit_score_sharing')", [DEMO.koffi]));
    const active = () => db.asUser(DEMO.koffi, async (q) => (await q.query<{ v: boolean }>("select public.has_active_consent('credit_score_sharing') as v")).rows[0].v);
    expect(await active()).toBe(false);
    await grant();
    expect(await active()).toBe(true);
    await expect(grant()).rejects.toThrow(/consents_one_active/);
    await db.asUser(DEMO.koffi, (q) => q.query("update public.consents set revoked_at = now() where user_id = $1 and revoked_at is null", [DEMO.koffi]));
    expect(await active()).toBe(false);
    await grant();
    expect((await db.one<{ n: number }>("select count(*)::int as n from public.consents where user_id = $1", [DEMO.koffi])).n).toBe(2);
  });
});
