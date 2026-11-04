// Notification queue through the real migrations (PGlite): the new message
// triggers, claiming, delivery through the simulated provider, retries and language.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db";
import { DEMO, TestDb } from "../../supabase/tests/harness";
import { dispatchNotifications } from "./notifications/dispatch";
import { SimulatedNotificationProvider } from "./notifications/simulated";

let db: TestDb;
let svc: Db;

const notes = (user: string, template: string) =>
  db.all<{ id: string; channel: string; delivery_status: string; attempts: number; payload: Record<string, unknown> }>(
    "select id, channel, delivery_status, attempts, payload from public.notifications where user_id = $1 and template = $2",
    [user, template],
  );
const plain = (s: string) => s.replace(/[  ]/g, " ");

beforeAll(async () => {
  db = await TestDb.create();
  svc = db.serviceDb();
}, 120_000);

afterAll(() => db?.close());

describe("message triggers", () => {
  it("a contribution that succeeds queues one 'contribution received' WhatsApp", async () => {
    const cycle = await db.one<{ id: string }>("select id from public.cycles where group_id = $1", [DEMO.adjameGroup]);
    const c = await svc.rpc<{ id: string }>("create_contribution", { p_cycle_id: cycle.id, p_member_id: DEMO.koffi, p_paid_by: DEMO.koffi });
    expect(await notes(DEMO.koffi, "contribution_received")).toEqual([]);
    await db.pg.query("update public.contributions set status = 'succeeded' where id = $1", [c.id]);
    await db.pg.query("update public.contributions set status = 'succeeded' where id = $1", [c.id]); // no duplicate
    const found = await notes(DEMO.koffi, "contribution_received");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ channel: "whatsapp", delivery_status: "queued" });
    expect(found[0].payload).toMatchObject({ group_name: "Tontine du marché d'Adjamé", cycle: 1, amount: 10_000 });
  });

  it("a Payer pour credited to the payee queues 'delivered' for the sender", async () => {
    const payee = await db.one<{ id: string }>("select id from public.payees where kyb_status = 'approved' and category = 'school' order by name limit 1");
    const dp = await db.one<{ id: string }>(
      `insert into public.directed_payments (sender_id, payee_id, purpose, beneficiary_name, amount, source_currency, source_amount, fee_amount, fx_rate, status)
       values ($1, $2, 'school', 'Fatou', 50000, 'EUR', 7623, 145, 655.957, 'paid') returning id`,
      [DEMO.aminata, payee.id],
    );
    await db.pg.query("update public.directed_payments set status = 'received' where id = $1", [dp.id]);
    const found = await notes(DEMO.aminata, "payer_pour_delivered");
    expect(found).toHaveLength(1);
    expect(found[0].payload).toMatchObject({ beneficiary_name: "Fatou", amount: 50_000, directed_payment_id: dp.id });
  });

  it("in-app messages are never queued for delivery", async () => {
    const row = await db.one<{ delivery_status: string }>(
      "insert into public.notifications (user_id, channel, template) values ($1, 'in_app', 'x') returning delivery_status",
      [DEMO.awa],
    );
    expect(row.delivery_status).toBe("in_app");
  });
});

describe("dispatch", () => {
  it("sends queued messages once, in each reader's language", async () => {
    await db.pg.query("update public.profiles set locale = 'en' where id = $1", [DEMO.aminata]);
    const provider = new SimulatedNotificationProvider();
    const first = await dispatchNotifications(svc, provider);
    expect(first.sent).toBeGreaterThanOrEqual(2);
    expect(await dispatchNotifications(svc, provider)).toEqual({ sent: 0, failed: 0 });

    const koffi = provider.outbox.find((m) => m.template === "contribution_received")!;
    expect(koffi).toMatchObject({ to: "2250500000002", channel: "whatsapp", locale: "fr" });
    expect(plain(koffi.text)).toBe("AduPay : nous avons bien reçu 10 000 FCFA pour « Tontine du marché d'Adjamé » (tour 1). Merci !");
    const aminata = provider.outbox.find((m) => m.template === "payer_pour_delivered")!;
    expect(aminata.locale).toBe("en");
    expect(plain(aminata.text)).toMatch(/^AduPay: your 50,000 FCFA payment for Fatou has reached .+\(démo\)\./);
    const [row] = await notes(DEMO.koffi, "contribution_received");
    expect(row.delivery_status).toBe("sent");
  });

  it("retries a failed delivery with a pause, then gives up after 3 attempts", async () => {
    await db.pg.query("update public.profiles set phone = '2250700009992' where id = $1", [DEMO.awa]);
    const { id } = await db.one<{ id: string }>(
      "insert into public.notifications (user_id, channel, template, payload) values ($1, 'sms', 'contribution_due', '{}') returning id",
      [DEMO.awa],
    );
    const provider = new SimulatedNotificationProvider();
    const status = () => db.one<{ delivery_status: string; attempts: number; last_error: string }>("select * from public.notifications where id = $1", [id]);
    expect(await dispatchNotifications(svc, provider)).toEqual({ sent: 0, failed: 1 });
    expect(await status()).toMatchObject({ delivery_status: "queued", attempts: 1, last_error: "simulated_delivery_failure" });
    expect(await dispatchNotifications(svc, provider)).toEqual({ sent: 0, failed: 0 }); // waits before retrying
    for (const attempt of [2, 3]) {
      await db.pg.query("update public.notifications set claimed_at = now() - interval '1 hour' where id = $1", [id]);
      await dispatchNotifications(svc, provider);
      expect((await status()).attempts).toBe(attempt);
    }
    expect((await status()).delivery_status).toBe("failed");
    await db.pg.query("update public.notifications set claimed_at = now() - interval '1 hour' where id = $1", [id]);
    expect(await dispatchNotifications(svc, provider)).toEqual({ sent: 0, failed: 0 });
  });

  it("signed-in users cannot claim the queue; they can mark their own messages read", async () => {
    await expect(db.userDb(DEMO.koffi).rpc("claim_notifications", { p_limit: 10 })).rejects.toThrow(/permission denied/);
    const marked = await db.userDb(DEMO.koffi).rpc<number>("mark_notifications_read");
    expect(marked).toBeGreaterThanOrEqual(1);
    const unread = await db.one<{ n: number }>("select count(*)::int as n from public.notifications where user_id = $1 and read_at is null", [DEMO.koffi]);
    expect(unread.n).toBe(0);
    const others = await db.one<{ n: number }>("select count(*)::int as n from public.notifications where user_id <> $1 and read_at is not null", [DEMO.koffi]);
    expect(others.n).toBe(0);
  });
});
