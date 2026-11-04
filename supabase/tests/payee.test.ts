import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO, TestDb } from "./harness";

let db: TestDb;
let school: string;

type Q = { query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> };
const as = <T>(user: string, fn: (q: Q) => Promise<T>) => db.asUser(user, fn as never) as Promise<T>;

async function directedPayment(status: "paid" | "received", beneficiary: string, reference: string) {
  const row = await db.one<{ id: string }>(
    `insert into public.directed_payments (sender_id, payee_id, purpose, beneficiary_name, reference, amount, source_currency, source_amount, fee_amount, fx_rate, status, paid_at, received_at)
     values ($1, $2, 'school', $3, $4, 150000, 'EUR', 23302, 434, 655.957, $5::public.directed_payment_status, now(), case when $5::text = 'received' then now() end) returning id`,
    [DEMO.aminata, school, beneficiary, reference, status],
  );
  return row.id;
}

beforeAll(async () => {
  db = await TestDb.create();
  school = (await db.one<{ id: string }>("select id from public.payees where category = 'school' order by name limit 1")).id;
  await db.pg.query("update public.payees set owner_id = $1 where id = $2", [DEMO.koffi, school]);
}, 120_000);

afterAll(() => db?.close());

describe("sign-up and review", () => {
  it("users cannot create payees directly (sign-up goes through the server)", async () => {
    await expect(
      as(DEMO.awa, (q) => q.query("insert into public.payees (name, category, city, owner_id) values ('Moi', 'school', 'Abidjan', $1)", [DEMO.awa])),
    ).rejects.toThrow(/permission denied/);
  });

  it("a pending business is hidden from the directory, visible to its owner, and only an admin can approve it", async () => {
    const id = (
      await db.one<{ id: string }>(
        "insert into public.payees (name, category, city, owner_id, kyb_status, rccm_number, submitted_at) values ('Pharmacie Nouvelle', 'pharmacy', 'Bouaké', $1, 'pending', 'CI-BKE-2024-B-00123', now()) returning id",
        [DEMO.aminata],
      )
    ).id;
    const seen = (user: string) => as(user, async (q) => (await q.query<{ id: string }>("select id from public.payees where id = $1", [id])).rows.length);
    expect(await seen(DEMO.koffi)).toBe(0);
    expect(await seen(DEMO.aminata)).toBe(1);

    await expect(as(DEMO.aminata, (q) => q.query("select public.review_payee($1, true)", [id]))).rejects.toThrow(/only admins/);
    await expect(as(DEMO.awa, (q) => q.query("select public.review_payee($1, false)", [id]))).rejects.toThrow(/needs a reason/);
    await as(DEMO.awa, (q) => q.query("select public.review_payee($1, true)", [id]));
    expect(await seen(DEMO.koffi)).toBe(1);
    expect(await db.one("select action, details->>'decision' as decision from public.audit_log where target_id = $1", [id])).toEqual({
      action: "kyb.review",
      decision: "approved",
    });
    await expect(as(DEMO.awa, (q) => q.query("select public.review_payee($1, true)", [id]))).rejects.toThrow(/no pending payee/);
  });

  it("one portal account manages one business", async () => {
    await expect(
      db.pg.query("insert into public.payees (name, category, city, owner_id) values ('Deuxième', 'school', 'Abidjan', $1)", [DEMO.koffi]),
    ).rejects.toThrow(/payees_one_per_owner/);
  });
});

describe("incoming payments", () => {
  let received: string;
  let inFlight: string;

  beforeAll(async () => {
    received = await directedPayment("received", "Fatou Traoré", "CM2 B");
    inFlight = await directedPayment("paid", "Moussa Koné", "6e A");
  });

  const incoming = (user: string, status = "all", search: string | null = null) =>
    as(user, async (q) =>
      (
        await q.query<{ id: string; beneficiary_name: string; sender_first_name: string; status: string }>(
          "select id, beneficiary_name, sender_first_name, status from public.payee_incoming($1, null, null, $2)",
          [status, search],
        )
      ).rows,
    );

  it("the business sees its payments with beneficiary, reference and the sender's first name only", async () => {
    const rows = await incoming(DEMO.koffi);
    expect(rows.map((r) => r.beneficiary_name).sort()).toEqual(["Fatou Traoré", "Moussa Koné"]);
    expect(rows.every((r) => r.sender_first_name === "Aminata")).toBe(true);
    expect(await incoming(DEMO.awa)).toEqual([]); // not their business
  });

  it("filters by status and search", async () => {
    expect((await incoming(DEMO.koffi, "to_confirm")).length).toBe(2);
    expect((await incoming(DEMO.koffi, "all", "cm2")).map((r) => r.id)).toEqual([received]);
    expect((await incoming(DEMO.koffi, "all", "moussa")).map((r) => r.id)).toEqual([inFlight]);
  });

  it("only the owner confirms, only once the money has arrived, and the sender is told", async () => {
    await expect(as(DEMO.awa, (q) => q.query("select public.confirm_directed_payment($1)", [received]))).rejects.toThrow(/not found/);
    await expect(as(DEMO.koffi, (q) => q.query("select public.confirm_directed_payment($1)", [inFlight]))).rejects.toThrow(/not_received_yet/);

    await as(DEMO.koffi, (q) => q.query("select public.confirm_directed_payment($1)", [received]));
    await as(DEMO.koffi, (q) => q.query("select public.confirm_directed_payment($1)", [received])); // a second tap is fine
    const dp = await db.one<{ status: string; confirmed_at: Date | null }>("select status, confirmed_at from public.directed_payments where id = $1", [received]);
    expect(dp.status).toBe("confirmed");
    expect(dp.confirmed_at).toBeTruthy();

    const notes = await db.all<{ user_id: string; template: string }>(
      "select user_id, template from public.notifications where payload->>'directed_payment_id' = $1",
      [received],
    );
    expect(notes).toEqual([{ user_id: DEMO.aminata, template: "payee_confirmed" }]);
    expect((await incoming(DEMO.koffi, "confirmed")).map((r) => r.id)).toEqual([received]);
  });

  it("the sender can read the confirmed status (what the live timeline shows)", async () => {
    const rows = await as(DEMO.aminata, async (q) => (await q.query<{ status: string }>("select status from public.directed_payments where id = $1", [received])).rows);
    expect(rows).toEqual([{ status: "confirmed" }]);
  });
});

describe("documents and settings", () => {
  it("KYB documents go only into the owner's own folder of the private bucket", async () => {
    expect(await db.one("select public from storage.buckets where id = 'kyb-documents'")).toEqual({ public: false });
    await as(DEMO.koffi, (q) => q.query("insert into storage.objects (bucket_id, name, owner) values ('kyb-documents', $1, $2)", [`${DEMO.koffi}/rccm.pdf`, DEMO.koffi]));
    await expect(
      as(DEMO.koffi, (q) => q.query("insert into storage.objects (bucket_id, name, owner) values ('kyb-documents', $1, $2)", [`${DEMO.awa}/x.pdf`, DEMO.koffi])),
    ).rejects.toThrow(/row-level security/);
    const others = await as(DEMO.aminata, async (q) => (await q.query("select name from storage.objects where bucket_id = 'kyb-documents'")).rows);
    expect(others).toEqual([]);
  });

  it("the owner updates contact details; users without a business cannot", async () => {
    await as(DEMO.koffi, (q) => q.query("select public.update_payee_contact('+2250700001234', 'Abobo, rue 12')"));
    expect(await db.one("select contact_phone, address from public.payees where id = $1", [school])).toEqual({
      contact_phone: "+2250700001234",
      address: "Abobo, rue 12",
    });
    await expect(as(DEMO.awa, (q) => q.query("select public.update_payee_contact('x', 'y')"))).rejects.toThrow(/no business/);
  });
});
