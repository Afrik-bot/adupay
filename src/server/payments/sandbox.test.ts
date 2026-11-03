import { describe, expect, it } from "vitest";
import { planFor, SANDBOX_SIGNATURE_HEADER, SandboxProvider, signSandboxPayload } from "./sandbox";
import type { RailRequest } from "./types";

const SECRET = "test-secret-at-least-16";

function request(key: string, accountRef = "0700000001"): RailRequest {
  return {
    paymentId: "p1",
    idempotencyKey: key,
    amount: 10_000,
    currency: "XOF",
    account: { provider: "orange_money", ref: accountRef },
  };
}

function fakeClock(start = 1_800_000_000_000) {
  let now = start;
  const timers: { at: number; fn: () => void }[] = [];
  return {
    now: () => now,
    schedule: (fn: () => void, ms: number) => void timers.push({ at: now + ms, fn }),
    advance(ms: number) {
      now += ms;
      for (const timer of timers.filter((t) => t.at <= now)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.fn();
      }
    },
  };
}

describe("planFor", () => {
  it("is deterministic per idempotency key", () => {
    expect(planFor(request("k-1"), 0)).toEqual(planFor(request("k-1"), 0));
  });

  it("matches the 90 / 7 / 3 % distribution with 1-5 s delays", () => {
    const counts = { success: 0, pending_success: 0, failure: 0 };
    for (let i = 0; i < 20_000; i++) {
      const plan = planFor(request(`key-${i}`), 0);
      counts[plan.o] += 1;
      expect(plan.d).toBeGreaterThanOrEqual(1000);
      expect(plan.d).toBeLessThan(5000);
      if (plan.o === "failure") expect(plan.c).toMatch(/^[A-Z_]+$/);
    }
    expect(counts.success / 20_000).toBeCloseTo(0.9, 1);
    expect(counts.pending_success / 20_000).toBeCloseTo(0.07, 1);
    expect(counts.failure / 20_000).toBeCloseTo(0.03, 1);
  });

  it("test account numbers force an outcome", () => {
    expect(planFor(request("a", "0700009990"), 0).o).toBe("success");
    expect(planFor(request("a", "0700009991"), 0).o).toBe("pending_success");
    expect(planFor(request("a", "0700009992"), 0).o).toBe("failure");
  });
});

describe("SandboxProvider", () => {
  it("reports pending, then the planned final status", async () => {
    const clock = fakeClock();
    const provider = new SandboxProvider({ secret: SECRET, now: clock.now });
    const { providerRef, status } = await provider.collect(request("x", "0700009992"));
    expect(status).toBe("pending");
    expect((await provider.getStatus(providerRef)).status).toBe("pending");
    clock.advance(5_000);
    expect(await provider.getStatus(providerRef)).toMatchObject({ status: "failed", failureCode: expect.any(String) });
  });

  it("pending-then-success sends a pending webhook before the success one", async () => {
    const clock = fakeClock();
    const delivered: { status: string }[] = [];
    const provider = new SandboxProvider({
      secret: SECRET,
      now: clock.now,
      schedule: clock.schedule,
      deliver: async (body) => void delivered.push(JSON.parse(body)),
    });
    const { providerRef } = await provider.collect(request("y", "0700009991"));
    clock.advance(5_000);
    expect(delivered.map((d) => d.status)).toEqual(["pending"]);
    expect((await provider.getStatus(providerRef)).status).toBe("pending");
    clock.advance(10_000);
    expect(delivered.map((d) => d.status)).toEqual(["pending", "succeeded"]);
    expect((await provider.getStatus(providerRef)).status).toBe("succeeded");
  });

  it("signs webhooks so handleWebhook accepts them", async () => {
    const clock = fakeClock();
    const deliveries: { body: string; headers: Record<string, string> }[] = [];
    const provider = new SandboxProvider({
      secret: SECRET,
      now: clock.now,
      schedule: clock.schedule,
      deliver: async (body, headers) => void deliveries.push({ body, headers }),
    });
    const { providerRef } = await provider.collect(request("z", "0700009990"));
    clock.advance(5_000);
    const [{ body, headers }] = deliveries;
    const event = await provider.handleWebhook(body, new Headers(headers));
    expect(event).toMatchObject({ providerRef, status: "succeeded" });
  });

  it("rejects missing, forged, tampered and stale signatures", async () => {
    const clock = fakeClock();
    const provider = new SandboxProvider({ secret: SECRET, now: clock.now });
    const body = JSON.stringify({ eventId: "e1", providerRef: "sbx_x", status: "succeeded" });
    const sign = (secret: string, raw: string, at = clock.now()) =>
      new Headers({ [SANDBOX_SIGNATURE_HEADER]: signSandboxPayload(secret, raw, at) });

    await expect(provider.handleWebhook(body, new Headers())).rejects.toThrow(/missing signature/);
    await expect(provider.handleWebhook(body, sign("another-secret-of-16+", body))).rejects.toThrow(/bad signature/);
    await expect(
      provider.handleWebhook(body.replace("succeeded", "failed"), sign(SECRET, body)),
    ).rejects.toThrow(/bad signature/);
    await expect(provider.handleWebhook(body, sign(SECRET, body, clock.now() - 10 * 60_000))).rejects.toThrow(/stale/);
    await expect(
      provider.handleWebhook(body, new Headers({ [SANDBOX_SIGNATURE_HEADER]: "garbage" })),
    ).rejects.toThrow(/malformed/);
    await expect(provider.handleWebhook(body, sign(SECRET, body))).resolves.toMatchObject({ status: "succeeded" });
  });

  it("verifyAccount rejects the 9992 demo account and accepts others", async () => {
    const provider = new SandboxProvider({ secret: SECRET });
    await expect(provider.verifyAccount({ provider: "wave", ref: "+2250700009992" })).resolves.toEqual({
      ok: false,
      reason: "ACCOUNT_NOT_FOUND",
    });
    await expect(provider.verifyAccount({ provider: "wave", ref: "+2250700009991" })).resolves.toEqual({
      ok: true,
      token: expect.stringMatching(/^sbxacct_[0-9a-f]{8}_9991$/),
    });
  });

  it("refuses a weak secret", () => {
    expect(() => new SandboxProvider({ secret: "short" })).toThrow(/16 characters/);
  });
});
