// The security review decisions of November 2026 (docs/security-review.md):
// phone numbers, the lottery draw and two-factor sign-in for staff.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO, TestDb } from "./harness";

let db: TestDb;

beforeAll(async () => {
  db = await TestDb.create();
}, 120_000);

afterAll(() => db?.close());

const rows = <T>(user: string, sql: string, params: unknown[] = [], aal: "aal1" | "aal2" = "aal2") =>
  db.asUser(user, async (q) => (await q.query<T>(sql, params)).rows, aal);

describe("phone numbers", () => {
  it("are not readable through the profiles table, not even by fellow members", async () => {
    await expect(db.asUser(DEMO.koffi, (q) => q.query("select phone from public.profiles where id = $1", [DEMO.awa]))).rejects.toThrow(/permission denied/);
    await expect(db.asUser(DEMO.koffi, (q) => q.query("select * from public.profiles"))).rejects.toThrow(/permission denied/);
  });

  it("contact_phones gives people their own number, and staff anyone's", async () => {
    const mine = await rows<{ user_id: string }>(DEMO.koffi, "select * from public.contact_phones(array[$1::uuid, $2::uuid])", [DEMO.awa, DEMO.koffi]);
    expect(mine.map((r) => r.user_id)).toEqual([DEMO.koffi]);
    const staff = await rows<{ user_id: string; phone: string }>(DEMO.awa, "select * from public.contact_phones(array[$1::uuid, $2::uuid])", [DEMO.awa, DEMO.koffi]);
    expect(staff).toHaveLength(2);
  });

  it("the manager sees unpaid members' numbers; members do not", async () => {
    const unpaid = await rows<{ member_id: string; phone: string }>(DEMO.awa, "select * from public.group_unpaid_members($1)", [DEMO.adjameGroup]);
    expect(unpaid.find((m) => m.member_id === DEMO.koffi)?.phone).toMatch(/0500000002$/);
    expect(await rows(DEMO.koffi, "select * from public.group_unpaid_members($1)", [DEMO.adjameGroup])).toEqual([]);
  });
});

describe("two-factor sign-in for staff", () => {
  it("a staff role only counts once the session passed a second factor", async () => {
    // Awa is the seeded admin.
    const [aal1] = await rows<{ admin: boolean; access: string }>(DEMO.awa, "select public.is_admin() as admin, public.staff_access() as access", [], "aal1");
    expect(aal1).toEqual({ admin: false, access: "mfa" });
    const [aal2] = await rows<{ admin: boolean; access: string }>(DEMO.awa, "select public.is_admin() as admin, public.staff_access() as access");
    expect(aal2).toEqual({ admin: true, access: "ok" });
    const [member] = await rows<{ access: string }>(DEMO.koffi, "select public.staff_access() as access");
    expect(member.access).toBe("none");
  });

  it("staff-only data and actions are refused without it", async () => {
    await expect(db.asUser(DEMO.awa, (q) => q.query("select * from public.admin_sanctions_flags(array[$1::uuid], '{}')", [DEMO.koffi]), "aal1")).rejects.toThrow(
      /staff only/,
    );
    const others = await rows(DEMO.awa, "select * from public.contact_phones(array[$1::uuid])", [DEMO.koffi], "aal1");
    expect(others).toEqual([]);
  });
});

describe("lottery draw", () => {
  it("uses the secure generator and is written to the audit log", async () => {
    const [{ src }] = await db.all<{ src: string }>("select prosrc as src from pg_proc where proname = 'start_group'");
    expect(src).toContain("gen_random_uuid()");
    expect(src).not.toMatch(/[^_]random\(\)/);

    const [{ v: groupId }] = await rows<{ v: string }>(
      DEMO.koffi,
      "select public.create_group('Tirage test', 10000, 'weekly', current_date, 5, 'lottery', 2, 500) as v",
    );
    const [{ invite_code }] = await db.all<{ invite_code: string }>("select invite_code from public.groups where id = $1", [groupId]);
    await rows(DEMO.aminata, "select public.join_group($1)", [invite_code]);
    await rows(DEMO.koffi, "select public.start_group($1)", [groupId]);

    const [entry] = await db.all<{ actor_id: string; details: { method: string; order: string[] } }>(
      "select actor_id, details from public.audit_log where action = 'tontine.draw' and target_id = $1",
      [groupId],
    );
    expect(entry.actor_id).toBe(DEMO.koffi);
    expect(entry.details.method).toBe("gen_random_uuid");
    expect([...entry.details.order].sort()).toEqual([DEMO.koffi, DEMO.aminata].sort());
  });
});
