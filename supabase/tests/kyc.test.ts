import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db";
import { DEMO, TestDb } from "./harness";

let db: TestDb;
let svc: Db;
const wallets: Record<string, string> = {};

const setTier = (user: string, tier: number) =>
  db.pg.query("update public.profiles set kyc_tier = $1 where id = $2", [tier, user]);

function collect(user: string, amount: number, { currency = "XOF", key = randomUUID() } = {}) {
  return svc.rpc<{ id: string }>("create_payment", {
    p_idempotency_key: key,
    p_user_id: user,
    p_direction: "collect",
    p_provider: "sandbox",
    p_amount: amount,
    p_currency: currency,
    p_ledger_account_id: wallets[`${user}:${currency}`],
  });
}

async function submit(user: string, documentType: string, path = `${user}/${randomUUID()}.jpg`) {
  const tier = documentType === "proof_of_address" ? 2 : 1;
  const row = await db.asUser(user, (q) =>
    q.query<{ id: string }>(
      `insert into public.kyc_records (user_id, tier_requested, document_type, document_path)
       values ($1, $2, $3, $4) returning id`,
      [user, tier, documentType, path],
    ),
  );
  return row.rows[0].id;
}

const review = (admin: string, id: string, decision: "approved" | "rejected", reason?: string) =>
  db.asUser(admin, (q) =>
    q.query<{ tier: number }>("select public.review_kyc_record($1, $2, $3) as tier", [id, decision, reason ?? null]),
  );

beforeAll(async () => {
  db = await TestDb.create();
  svc = db.serviceDb();
  for (const user of [DEMO.koffi, DEMO.aminata]) {
    for (const currency of ["XOF", "EUR"]) {
      wallets[`${user}:${currency}`] = await svc.rpc<string>("ensure_ledger_account", {
        p_owner_type: "user",
        p_owner_id: user,
        p_currency: currency,
      });
    }
  }
}, 120_000);

afterAll(() => db?.close());

describe("KYC limits in create_payment", () => {
  beforeEach(async () => {
    // Each test starts with no payments today.
    await db.pg.query("update public.payments set created_at = now() - interval '2 days'");
  });

  it("tier 0 cannot pay at all", async () => {
    await setTier(DEMO.koffi, 0);
    await expect(collect(DEMO.koffi, 1_000)).rejects.toThrow(/kyc_tier_0/);
  });

  it("tier 1 can pay up to 200 000 FCFA a day, and not a franc more", async () => {
    await setTier(DEMO.koffi, 1);
    await collect(DEMO.koffi, 150_000);
    await collect(DEMO.koffi, 50_000);
    await expect(collect(DEMO.koffi, 1)).rejects.toThrow(/kyc_daily_limit/);
  });

  it("tier 2 allows 2 000 000 FCFA a day", async () => {
    await setTier(DEMO.koffi, 2);
    await collect(DEMO.koffi, 1_999_999);
    await collect(DEMO.koffi, 1);
    await expect(collect(DEMO.koffi, 1)).rejects.toThrow(/kyc_daily_limit/);
  });

  it("failed payments do not use up the limit", async () => {
    await setTier(DEMO.koffi, 1);
    const p = await collect(DEMO.koffi, 200_000);
    await svc.rpc("settle_payment", { p_payment_id: p.id, p_status: "failed", p_failure_code: "X" });
    await expect(collect(DEMO.koffi, 200_000)).resolves.toBeTruthy();
  });

  it("yesterday's payments do not count", async () => {
    await setTier(DEMO.koffi, 1);
    await collect(DEMO.koffi, 200_000);
    await db.pg.query("update public.payments set created_at = now() - interval '1 day'");
    await expect(collect(DEMO.koffi, 200_000)).resolves.toBeTruthy();
  });

  it("a retry of a payment already made is not refused by the limit", async () => {
    await setTier(DEMO.koffi, 1);
    const key = randomUUID();
    const first = await collect(DEMO.koffi, 200_000, { key });
    const retry = await collect(DEMO.koffi, 200_000, { key });
    expect(retry.id).toBe(first.id);
  });

  it("foreign-currency payments count at their XOF value (EUR at the CFA peg)", async () => {
    await setTier(DEMO.aminata, 1);
    await collect(DEMO.aminata, 30_000, { currency: "EUR" }); // 300 EUR = 196 787.1 -> 196 788 FCFA
    await collect(DEMO.aminata, 487, { currency: "EUR" }); // 4.87 EUR = 3 194.5 -> 3 195 FCFA; total 199 983
    await expect(collect(DEMO.aminata, 3, { currency: "EUR" })).rejects.toThrow(/kyc_daily_limit/); // +20 FCFA
  });

  it("does not apply to payouts or system payments", async () => {
    await setTier(DEMO.koffi, 0);
    await expect(
      svc.rpc("create_payment", {
        p_idempotency_key: randomUUID(),
        p_user_id: null,
        p_direction: "collect",
        p_provider: "sandbox",
        p_amount: 5_000_000,
        p_currency: "XOF",
        p_ledger_account_id: wallets[`${DEMO.koffi}:XOF`],
      }),
    ).resolves.toBeTruthy();
  });

  it("my_kyc_status reports the caller's own tier, limit and usage", async () => {
    await setTier(DEMO.koffi, 1);
    await collect(DEMO.koffi, 25_000);
    const rows = await db.asUser(DEMO.koffi, (q) => q.query("select * from public.my_kyc_status()"));
    expect(rows.rows).toEqual([{ kyc_tier: 1, daily_limit_xof: 200_000, used_today_xof: 25_000 }]);
  });

  it("users cannot read anyone's usage directly", async () => {
    await expect(
      db.asUser(DEMO.aminata, (q) => q.query("select public.daily_usage_xof($1)", [DEMO.koffi])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("KYC submissions and review", () => {
  beforeAll(async () => {
    await setTier(DEMO.koffi, 0);
    await setTier(DEMO.aminata, 0);
  });

  it("a user can only point a submission at their own storage folder", async () => {
    await expect(submit(DEMO.koffi, "cni", `${DEMO.aminata}/stolen.jpg`)).rejects.toThrow(/row-level security/);
    await expect(submit(DEMO.koffi, "cni", `elsewhere.jpg`)).rejects.toThrow(/row-level security/);
  });

  it("one pending review per document type", async () => {
    await submit(DEMO.aminata, "passport");
    await expect(submit(DEMO.aminata, "passport")).rejects.toThrow(/kyc_records_one_pending/);
  });

  it("only admins can review; Awa (admin) approves Koffi to tier 1 then tier 2", async () => {
    const id = await submit(DEMO.koffi, "cni");
    const selfie = await submit(DEMO.koffi, "selfie");

    await expect(review(DEMO.koffi, id, "approved")).rejects.toThrow(/only admins/);

    expect((await review(DEMO.awa, id, "approved")).rows[0].tier).toBe(0); // ID alone is not enough
    expect((await review(DEMO.awa, selfie, "approved")).rows[0].tier).toBe(1);

    const address = await submit(DEMO.koffi, "proof_of_address");
    expect((await review(DEMO.awa, address, "approved")).rows[0].tier).toBe(2);

    const audit = await db.all<{ action: string; actor_id: string }>(
      "select action, actor_id from public.audit_log where target_id = any($1)",
      [[id, selfie, address]],
    );
    expect(audit).toHaveLength(3);
    expect(audit.every((a) => a.action === "kyc.review" && a.actor_id === DEMO.awa)).toBe(true);
  });

  it("a rejection needs a reason, and a record cannot be reviewed twice", async () => {
    const id = await submit(DEMO.aminata, "selfie");
    await expect(review(DEMO.awa, id, "rejected")).rejects.toThrow(/needs a reason/);
    await review(DEMO.awa, id, "rejected", "Photo floue, merci de recommencer");
    await expect(review(DEMO.awa, id, "approved")).rejects.toThrow(/no pending KYC record/);
    const row = await db.one<{ status: string; rejection_reason: string }>(
      "select status, rejection_reason from public.kyc_records where id = $1",
      [id],
    );
    expect(row).toEqual({ status: "rejected", rejection_reason: "Photo floue, merci de recommencer" });
    // After a rejection the user may submit again.
    await expect(submit(DEMO.aminata, "selfie")).resolves.toBeTruthy();
  });
});

describe("kyc-documents storage", () => {
  const upload = (user: string, name: string) =>
    db.asUser(user, (q) =>
      q.query("insert into storage.objects (bucket_id, name, owner) values ('kyc-documents', $1, $2)", [name, user]),
    );
  const visible = (user: string) =>
    db.asUser(user, (q) => q.query<{ name: string }>("select name from storage.objects where bucket_id = 'kyc-documents'"));

  it("the bucket is private", async () => {
    expect(await db.one("select public from storage.buckets where id = 'kyc-documents'")).toEqual({ public: false });
  });

  it("users upload only into their own folder and see only their own files; admins see all", async () => {
    await upload(DEMO.koffi, `${DEMO.koffi}/id.jpg`);
    await upload(DEMO.aminata, `${DEMO.aminata}/passport.jpg`);
    await expect(upload(DEMO.koffi, `${DEMO.aminata}/fake.jpg`)).rejects.toThrow(/row-level security/);

    expect((await visible(DEMO.koffi)).rows.map((r) => r.name)).toEqual([`${DEMO.koffi}/id.jpg`]);
    expect((await visible(DEMO.awa)).rows).toHaveLength(2);
  });

  it("uploaded evidence cannot be replaced or deleted by the user", async () => {
    const changed = await db.asUser(DEMO.koffi, (q) =>
      q.query("update storage.objects set name = name || '.x' where bucket_id = 'kyc-documents'"),
    );
    expect(changed.affectedRows).toBe(0);
    const deleted = await db.asUser(DEMO.koffi, (q) => q.query("delete from storage.objects where bucket_id = 'kyc-documents'"));
    expect(deleted.affectedRows).toBe(0);
  });
});
