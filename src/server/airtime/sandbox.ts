import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { signSandboxPayload } from "../payments/sandbox";
import { InvalidWebhookError } from "../payments/types";
import type { AirtimeOperator, AirtimeProduct, AirtimeProvider, AirtimePurchase, AirtimeResult, AirtimeWebhookEvent } from "./types";

export const AIRTIME_SIGNATURE_HEADER = "x-adupay-airtime-signature";
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const FAILURE_CODES = ["NUMBER_INACTIVE", "OPERATOR_UNAVAILABLE", "PRODUCT_UNAVAILABLE", "TIMEOUT"] as const;

/** Demo numbers that force an outcome, like the payment sandbox. */
export const SANDBOX_AIRTIME_NUMBERS: Record<string, Outcome> = {
  "9990": "success",
  "9991": "pending_success",
  "9992": "failure",
};

type Outcome = "success" | "pending_success" | "failure";
interface Plan {
  o: Outcome;
  d: number;
  t: number;
  c?: string;
}

/** Sample catalogue: the same ids and prices the migration seeds (admins edit prices in the app). */
const AIRTIME = [500, 1000, 2000, 5000];
const DATA = [
  { mb: 150, price: 200, days: 1, label: "Pass 150 Mo · 1 jour" },
  { mb: 500, price: 500, days: 7, label: "Pass 500 Mo · 7 jours" },
  { mb: 1500, price: 2000, days: 30, label: "Pass 1,5 Go · 30 jours" },
  { mb: 5000, price: 5000, days: 30, label: "Pass 5 Go · 30 jours" },
];
export const SANDBOX_CATALOGUE: AirtimeProduct[] = (["orange", "mtn", "moov"] as const).flatMap((operator) => [
  ...AIRTIME.map((xof) => ({
    id: `${operator}-airtime-${xof}`,
    operator,
    type: "airtime" as const,
    label: `Crédit ${String(xof).replace(/\B(?=(\d{3})+$)/g, " ")} FCFA`,
    dataMb: null,
    priceXof: xof,
    validityDays: null,
  })),
  ...DATA.map((d) => ({
    id: `${operator}-data-${d.mb}`,
    operator,
    type: "data" as const,
    label: d.label,
    dataMb: d.mb,
    priceXof: operator === "moov" ? d.price - 50 : d.price,
    validityDays: d.days,
  })),
]);

export interface SandboxAirtimeOptions {
  secret: string;
  webhookUrl?: string;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => void;
  deliver?: (rawBody: string, headers: Record<string, string>) => Promise<void>;
}

/** 90% delivered, 7% pending then delivered, 3% failed, after 1–5 s; deterministic per key. */
export function airtimePlanFor(request: Pick<AirtimePurchase, "idempotencyKey" | "msisdn">, now: number): Plan {
  const digest = createHash("sha256").update(`airtime:${request.idempotencyKey}`).digest();
  const roll = digest.readUInt32BE(0) / 2 ** 32;
  const forced = SANDBOX_AIRTIME_NUMBERS[request.msisdn.slice(-4)];
  const o: Outcome = forced ?? (roll < 0.9 ? "success" : roll < 0.97 ? "pending_success" : "failure");
  const plan: Plan = { o, d: 1000 + Math.floor((digest.readUInt32BE(4) / 2 ** 32) * 4000), t: now };
  if (o === "failure") plan.c = FAILURE_CODES[digest[8] % FAILURE_CODES.length];
  return plan;
}

const encodeRef = (plan: Plan) => `sbxair_${Buffer.from(JSON.stringify(plan)).toString("base64url")}`;
function decodeRef(ref: string): Plan {
  if (!ref.startsWith("sbxair_")) throw new Error("Not a sandbox airtime reference");
  return JSON.parse(Buffer.from(ref.slice(7), "base64url").toString("utf8")) as Plan;
}
function statusAt(plan: Plan, now: number): Omit<AirtimeResult, "providerRef"> {
  const elapsed = now - plan.t;
  if (plan.o === "pending_success") return elapsed < plan.d * 3 ? { status: "pending" } : { status: "succeeded" };
  if (elapsed < plan.d) return { status: "pending" };
  return plan.o === "success" ? { status: "succeeded" } : { status: "failed", failureCode: plan.c };
}

export class SandboxAirtimeProvider implements AirtimeProvider {
  readonly name = "sandbox";
  private readonly now: () => number;
  private readonly schedule: (callback: () => void, delayMs: number) => void;

  constructor(private readonly options: SandboxAirtimeOptions) {
    if (!options.secret || options.secret.length < 16) throw new Error("Sandbox webhook secret must be at least 16 characters");
    this.now = options.now ?? Date.now;
    this.schedule = options.schedule ?? ((callback, delayMs) => void setTimeout(callback, delayMs));
  }

  async listProducts(operator: AirtimeOperator) {
    return SANDBOX_CATALOGUE.filter((p) => p.operator === operator);
  }

  async purchase(request: AirtimePurchase): Promise<AirtimeResult> {
    if (!/^225\d{10}$/.test(request.msisdn)) return { providerRef: `sbxair_invalid_${request.idempotencyKey}`, status: "failed", failureCode: "INVALID_NUMBER" };
    if (!SANDBOX_CATALOGUE.some((p) => p.id === request.productId)) {
      return { providerRef: `sbxair_unknown_${request.idempotencyKey}`, status: "failed", failureCode: "PRODUCT_UNAVAILABLE" };
    }
    const plan = airtimePlanFor(request, this.now());
    const providerRef = encodeRef(plan);
    if (plan.o === "pending_success") {
      this.callback(providerRef, plan.d, { status: "pending" });
      this.callback(providerRef, plan.d * 3, { status: "succeeded" });
    } else {
      this.callback(providerRef, plan.d, statusAt(plan, plan.t + plan.d));
    }
    return { providerRef, status: "pending" };
  }

  async getStatus(providerRef: string) {
    if (!providerRef.startsWith("sbxair_") || providerRef.startsWith("sbxair_invalid_") || providerRef.startsWith("sbxair_unknown_")) {
      return { status: "failed" as const, failureCode: "UNKNOWN_REFERENCE" };
    }
    return statusAt(decodeRef(providerRef), this.now());
  }

  async handleWebhook(rawBody: string, headers: Headers): Promise<AirtimeWebhookEvent> {
    const header = headers.get(AIRTIME_SIGNATURE_HEADER);
    if (!header) throw new InvalidWebhookError("missing signature");
    const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
    const t = Number(parts.t);
    if (!Number.isFinite(t) || !parts.v1) throw new InvalidWebhookError("malformed signature");
    if (Math.abs(this.now() - t * 1000) > SIGNATURE_TOLERANCE_MS) throw new InvalidWebhookError("stale signature");
    const expected = Buffer.from(signSandboxPayload(this.options.secret, rawBody, t * 1000).split("v1=")[1], "hex");
    const received = Buffer.from(parts.v1, "hex");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new InvalidWebhookError("bad signature");
    const body = JSON.parse(rawBody) as Partial<AirtimeWebhookEvent>;
    if (typeof body.eventId !== "string" || typeof body.providerRef !== "string" || !["pending", "succeeded", "failed"].includes(body.status!)) {
      throw new InvalidWebhookError("malformed body");
    }
    return { eventId: body.eventId, providerRef: body.providerRef, status: body.status!, failureCode: body.failureCode };
  }

  private callback(providerRef: string, delayMs: number, result: Omit<AirtimeResult, "providerRef">) {
    if (!this.options.webhookUrl && !this.options.deliver) return;
    this.schedule(() => {
      const rawBody = JSON.stringify({ eventId: randomUUID(), providerRef, ...result });
      const headers = { "content-type": "application/json", [AIRTIME_SIGNATURE_HEADER]: signSandboxPayload(this.options.secret, rawBody, this.now()) };
      const deliver =
        this.options.deliver ?? (async (body: string, h: Record<string, string>) => void (await fetch(this.options.webhookUrl!, { method: "POST", body, headers: h })));
      deliver(rawBody, headers).catch((error) => console.warn("sandbox airtime webhook failed", error));
    }, delayMs);
  }
}
