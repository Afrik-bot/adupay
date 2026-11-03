import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  InvalidWebhookError,
  type PaymentProvider,
  type PaymentStatus,
  type RailRequest,
  type RailResult,
  type WebhookEvent,
} from "./types";

export const SANDBOX_SIGNATURE_HEADER = "x-adupay-sandbox-signature";
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const FAILURE_CODES = ["INSUFFICIENT_FUNDS", "ACCOUNT_BLOCKED", "LIMIT_EXCEEDED", "TIMEOUT"] as const;

/**
 * How a sandbox payment will behave:
 *  - success:          pending for `delayMs`, then succeeded
 *  - pending_success:  pending for 3 x `delayMs` (one "still pending" webhook on the way), then succeeded
 *  - failure:          pending for `delayMs`, then failed with `failureCode`
 */
export type SandboxOutcome = "success" | "pending_success" | "failure";

interface SandboxPlan {
  o: SandboxOutcome;
  d: number;
  t: number;
  c?: string;
}

/**
 * Demo account numbers that force an outcome, so a demo or test can show each path.
 * Any other account gets the 90 / 7 / 3 % distribution.
 */
export const SANDBOX_TEST_ACCOUNTS: Record<string, SandboxOutcome> = {
  "9990": "success",
  "9991": "pending_success",
  "9992": "failure",
};

export interface SandboxOptions {
  /** HMAC secret shared with the webhook route. */
  secret: string;
  /** Where simulated rail callbacks are POSTed. Omit to disable callbacks. */
  webhookUrl?: string;
  now?: () => number;
  /** Defaults to setTimeout; tests inject a fake clock. */
  schedule?: (callback: () => void, delayMs: number) => void;
  /** Defaults to fetch(webhookUrl). */
  deliver?: (rawBody: string, headers: Record<string, string>) => Promise<void>;
}

/**
 * Deterministic in the idempotency key: a retry of the same request gets the
 * same outcome, like a real rail that dedupes on the key. The plan travels in
 * the provider reference, so getStatus works across server restarts.
 */
export function planFor(request: Pick<RailRequest, "idempotencyKey" | "account">, now: number): SandboxPlan {
  const digest = createHash("sha256").update(request.idempotencyKey).digest();
  const roll = digest.readUInt32BE(0) / 2 ** 32;
  const delayMs = 1000 + Math.floor((digest.readUInt32BE(4) / 2 ** 32) * 4000);

  const forced = SANDBOX_TEST_ACCOUNTS[request.account.ref.slice(-4)];
  const outcome: SandboxOutcome = forced ?? (roll < 0.9 ? "success" : roll < 0.97 ? "pending_success" : "failure");
  const plan: SandboxPlan = { o: outcome, d: delayMs, t: now };
  if (outcome === "failure") plan.c = FAILURE_CODES[digest[8] % FAILURE_CODES.length];
  return plan;
}

function encodeRef(plan: SandboxPlan): string {
  return `sbx_${Buffer.from(JSON.stringify(plan)).toString("base64url")}`;
}

function decodeRef(providerRef: string): SandboxPlan {
  if (!providerRef.startsWith("sbx_")) throw new Error("Not a sandbox reference");
  return JSON.parse(Buffer.from(providerRef.slice(4), "base64url").toString("utf8")) as SandboxPlan;
}

function statusAt(plan: SandboxPlan, now: number): Omit<RailResult, "providerRef"> {
  const elapsed = now - plan.t;
  if (plan.o === "pending_success") return elapsed < plan.d * 3 ? { status: "pending" } : { status: "succeeded" };
  if (elapsed < plan.d) return { status: "pending" };
  return plan.o === "success" ? { status: "succeeded" } : { status: "failed", failureCode: plan.c };
}

export function signSandboxPayload(secret: string, rawBody: string, timestampMs: number): string {
  const t = Math.floor(timestampMs / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

export class SandboxProvider implements PaymentProvider {
  readonly name = "sandbox";
  private readonly now: () => number;
  private readonly schedule: (callback: () => void, delayMs: number) => void;

  constructor(private readonly options: SandboxOptions) {
    if (!options.secret || options.secret.length < 16) {
      throw new Error("Sandbox webhook secret must be at least 16 characters");
    }
    this.now = options.now ?? Date.now;
    this.schedule = options.schedule ?? ((callback, delayMs) => void setTimeout(callback, delayMs));
  }

  collect(request: RailRequest): Promise<RailResult> {
    return this.start(request);
  }

  payout(request: RailRequest): Promise<RailResult> {
    return this.start(request);
  }

  async verifyAccount(account: RailRequest["account"]): Promise<{ ok: true } | { ok: false; reason: string }> {
    // Same demo convention as payments: an account ending 9992 does not exist.
    return SANDBOX_TEST_ACCOUNTS[account.ref.slice(-4)] === "failure"
      ? { ok: false, reason: "ACCOUNT_NOT_FOUND" }
      : { ok: true };
  }

  async getStatus(providerRef: string): Promise<Omit<RailResult, "providerRef">> {
    return statusAt(decodeRef(providerRef), this.now());
  }

  async handleWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent> {
    const header = headers.get(SANDBOX_SIGNATURE_HEADER);
    if (!header) throw new InvalidWebhookError("missing signature");
    const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
    const t = Number(parts.t);
    if (!Number.isFinite(t) || !parts.v1) throw new InvalidWebhookError("malformed signature");
    if (Math.abs(this.now() - t * 1000) > SIGNATURE_TOLERANCE_MS) throw new InvalidWebhookError("stale signature");

    const expected = Buffer.from(signSandboxPayload(this.options.secret, rawBody, t * 1000).split("v1=")[1], "hex");
    const received = Buffer.from(parts.v1, "hex");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new InvalidWebhookError("bad signature");
    }

    const body = JSON.parse(rawBody) as Partial<WebhookEvent>;
    const statuses: PaymentStatus[] = ["pending", "succeeded", "failed"];
    if (typeof body.eventId !== "string" || typeof body.providerRef !== "string" || !statuses.includes(body.status!)) {
      throw new InvalidWebhookError("malformed body");
    }
    return { eventId: body.eventId, providerRef: body.providerRef, status: body.status!, failureCode: body.failureCode };
  }

  private async start(request: RailRequest): Promise<RailResult> {
    const plan = planFor(request, this.now());
    const providerRef = encodeRef(plan);
    if (plan.o === "pending_success") {
      this.scheduleCallback(providerRef, plan.d, { status: "pending" });
      this.scheduleCallback(providerRef, plan.d * 3, { status: "succeeded" });
    } else {
      this.scheduleCallback(providerRef, plan.d, statusAt(plan, plan.t + plan.d));
    }
    return { providerRef, status: "pending" };
  }

  private scheduleCallback(providerRef: string, delayMs: number, result: Omit<RailResult, "providerRef">) {
    if (!this.options.webhookUrl && !this.options.deliver) return;
    this.schedule(() => {
      const rawBody = JSON.stringify({ eventId: randomUUID(), providerRef, ...result });
      const headers = {
        "content-type": "application/json",
        [SANDBOX_SIGNATURE_HEADER]: signSandboxPayload(this.options.secret, rawBody, this.now()),
      };
      const deliver =
        this.options.deliver ??
        (async (body: string, h: Record<string, string>) => {
          await fetch(this.options.webhookUrl!, { method: "POST", body, headers: h });
        });
      // Delivery failures are expected sometimes; reconciliation catches them.
      deliver(rawBody, headers).catch((error) => console.warn("sandbox webhook delivery failed", error));
    }, delayMs);
  }
}
