import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO, TestDb } from "./harness";

let db: TestDb;

type Due = { group_name: string; cycle_number: number; amount: number; member_id: string; paid: boolean };

const dues = (user: string) =>
  db.asUser(user, (q) => q.query<Due>("select group_name, cycle_number, amount, member_id, paid from public.my_upcoming_dues()"));

beforeAll(async () => {
  db = await TestDb.create();
}, 120_000);

afterAll(() => db?.close());

describe("my_upcoming_dues", () => {
  it("lists the current cycle of each active group the user belongs to", async () => {
    // Seed: Adjamé is active with cycle 1 collecting; Yopougon is still a draft.
    const awa = await dues(DEMO.awa);
    expect(awa.rows).toEqual([
      { group_name: "Tontine du marché d'Adjamé", cycle_number: 1, amount: 10_000, member_id: DEMO.awa, paid: false },
    ]);
  });

  it("marks a due as paid once a contribution for that member succeeded", async () => {
    const cycle = await db.one<{ id: string }>("select id from public.cycles where group_id = $1 and number = 1", [
      DEMO.adjameGroup,
    ]);
    await db.pg.query(
      `insert into public.contributions (cycle_id, member_id, paid_by, amount, currency, status)
       values ($1, $2, $2, 10000, 'XOF', 'succeeded')`,
      [cycle.id, DEMO.koffi],
    );
    expect((await dues(DEMO.koffi)).rows.map((d) => d.paid)).toEqual([true]);
    expect((await dues(DEMO.awa)).rows.map((d) => d.paid)).toEqual([false]);
  });

  it("a sponsor sees the due of the member they pay for", async () => {
    await db.pg.query("update public.groups set status = 'active' where id = $1", [DEMO.yopougonGroup]);
    await db.pg.query("insert into public.cycles (group_id, number, due_date) values ($1, 1, current_date + 30)", [
      DEMO.yopougonGroup,
    ]);
    const aminata = await dues(DEMO.aminata);
    expect(aminata.rows).toEqual([
      { group_name: "Épargne Yopougon", cycle_number: 1, amount: 25_000, member_id: DEMO.koffi, paid: false },
    ]);
  });

  it("returns nothing for someone in no group", async () => {
    const outsider = "44444444-4444-4444-8444-444444444444";
    await db.pg.query("insert into auth.users (id, phone) values ($1, '2250100000004')", [outsider]);
    expect((await dues(outsider)).rows).toEqual([]);
  });
});

describe("linked account defaults", () => {
  const link = (user: string, masked: string, isDefault = false) =>
    db.asUser(user, (q) =>
      q.query<{ id: string }>(
        `insert into public.linked_accounts (user_id, provider, account_masked, account_ref_hash, is_default)
         values ($1, 'orange_money', $2, $3, $4) returning id`,
        [user, masked, `hash-${masked}`, isDefault],
      ),
    );
  const defaults = async (user: string) =>
    (
      await db.asUser(user, (q) =>
        q.query<{ account_masked: string }>("select account_masked from public.linked_accounts where is_default"),
      )
    ).rows.map((r) => r.account_masked);

  it("set_default_linked_account moves the default; there is only ever one", async () => {
    const a = (await link(DEMO.koffi, "•••• 0001", true)).rows[0].id;
    const b = (await link(DEMO.koffi, "•••• 0002")).rows[0].id;
    expect(await defaults(DEMO.koffi)).toEqual(["•••• 0001"]);

    await db.asUser(DEMO.koffi, (q) => q.query("select public.set_default_linked_account($1)", [b]));
    expect(await defaults(DEMO.koffi)).toEqual(["•••• 0002"]);

    await db.asUser(DEMO.koffi, (q) => q.query("select public.set_default_linked_account($1)", [a]));
    expect(await defaults(DEMO.koffi)).toEqual(["•••• 0001"]);
  });

  it("users cannot flip is_default directly or make someone else's account default", async () => {
    const theirs = (await link(DEMO.aminata, "•••• 0009", true)).rows[0].id;
    await expect(
      db.asUser(DEMO.koffi, (q) => q.query("update public.linked_accounts set is_default = true")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(DEMO.koffi, (q) => q.query("select public.set_default_linked_account($1)", [theirs])),
    ).rejects.toThrow(/not found/);
    expect(await defaults(DEMO.aminata)).toEqual(["•••• 0009"]);
  });

  it("deleting the default promotes the most recent remaining account", async () => {
    await link(DEMO.awa, "•••• 1001", true);
    await link(DEMO.awa, "•••• 1002");
    await db.asUser(DEMO.awa, (q) => q.query("delete from public.linked_accounts where is_default"));
    expect(await defaults(DEMO.awa)).toEqual(["•••• 1002"]);
  });

  it("users cannot mark their own account as verified", async () => {
    await expect(
      db.asUser(DEMO.awa, (q) => q.query("update public.linked_accounts set verified_at = now()")),
    ).rejects.toThrow(/permission denied/);
  });
});
