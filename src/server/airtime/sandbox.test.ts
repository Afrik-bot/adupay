import { describe, expect, it } from "vitest";
import { signSandboxPayload } from "../payments/sandbox";
import { AIRTIME_SIGNATURE_HEADER, airtimePlanFor, SANDBOX_CATALOGUE, SandboxAirtimeProvider } from "./sandbox";

const SECRET = "test-secret-at-least-16";

describe("SandboxAirtimeProvider", () => {
  it("lists a catalogue per network, airtime and data", async () => {
    const provider = new SandboxAirtimeProvider({ secret: SECRET });
    for (const op of ["orange", "mtn", "moov"] as const) {
      const list = await provider.listProducts(op);
      expect(list.some((p) => p.type === "airtime")).toBe(true);
      expect(list.filter((p) => p.type === "data").every((p) => p.dataMb && p.validityDays)).toBe(true);
    }
    expect(new Set(SANDBOX_CATALOGUE.map((p) => p.id)).size).toBe(SANDBOX_CATALOGUE.length);
  });

  it("forces outcomes for test numbers and is deterministic per key", () => {
    expect(airtimePlanFor({ idempotencyKey: "a", msisdn: "2250700009990" }, 0).o).toBe("success");
    expect(airtimePlanFor({ idempotencyKey: "a", msisdn: "2250700009991" }, 0).o).toBe("pending_success");
    expect(airtimePlanFor({ idempotencyKey: "a", msisdn: "2250700009992" }, 0)).toMatchObject({ o: "failure", c: expect.any(String) });
    const a = airtimePlanFor({ idempotencyKey: "k1", msisdn: "2250711223344" }, 0);
    expect(airtimePlanFor({ idempotencyKey: "k1", msisdn: "2250711223344" }, 0)).toEqual(a);
    expect(a.d).toBeGreaterThanOrEqual(1000);
    expect(a.d).toBeLessThanOrEqual(5000);
  });

  it("delivers about 90 / 7 / 3 %", () => {
    const counts = { success: 0, pending_success: 0, failure: 0 };
    for (let i = 0; i < 4000; i++) counts[airtimePlanFor({ idempotencyKey: `k${i}`, msisdn: "2250711223344" }, 0).o]++;
    expect(counts.success / 4000).toBeGreaterThan(0.87);
    expect(counts.failure / 4000).toBeLessThan(0.05);
  });

  it("sends a signed webhook and rejects forged or stale ones", async () => {
    let now = 1_000_000;
    const hooks: { body: string; headers: Record<string, string> }[] = [];
    const timers: (() => void)[] = [];
    const provider = new SandboxAirtimeProvider({
      secret: SECRET,
      now: () => now,
      schedule: (fn) => void timers.push(fn),
      deliver: async (body, headers) => void hooks.push({ body, headers }),
    });
    const result = await provider.purchase({ msisdn: "2250700009990", productId: "orange-data-500", idempotencyKey: "x" });
    expect(result.status).toBe("pending");
    timers.forEach((fn) => fn());
    const event = await provider.handleWebhook(hooks[0].body, new Headers(hooks[0].headers));
    expect(event).toMatchObject({ providerRef: result.providerRef, status: "succeeded" });

    const forged = { ...hooks[0].headers, [AIRTIME_SIGNATURE_HEADER]: signSandboxPayload("another-secret-123", hooks[0].body, now) };
    await expect(provider.handleWebhook(hooks[0].body, new Headers(forged))).rejects.toThrow(/bad signature/);
    now += 10 * 60_000;
    await expect(provider.handleWebhook(hooks[0].body, new Headers(hooks[0].headers))).rejects.toThrow(/stale/);
  });

  it("refuses unknown products and invalid numbers without delivering", async () => {
    const provider = new SandboxAirtimeProvider({ secret: SECRET });
    expect(await provider.purchase({ msisdn: "2250700009990", productId: "nope", idempotencyKey: "y" })).toMatchObject({ status: "failed", failureCode: "PRODUCT_UNAVAILABLE" });
    expect(await provider.purchase({ msisdn: "33600000003", productId: "orange-data-500", idempotencyKey: "z" })).toMatchObject({ status: "failed", failureCode: "INVALID_NUMBER" });
  });
});
