import type { Currency } from "@/lib/money";

export type PaymentStatus = "pending" | "succeeded" | "failed";
export type PaymentDirection = "collect" | "payout";
export type WalletProvider = "orange_money" | "mtn_momo" | "moov_money" | "wave" | "bank";

export interface RailRequest {
  /** AduPay payment id. */
  paymentId: string;
  /** Passed through to the rail so it can dedupe retries on its side too. */
  idempotencyKey: string;
  amount: number;
  currency: Currency;
  /** The external wallet or bank account being debited (collect) or credited (payout). */
  account: { provider: WalletProvider; ref: string };
}

export interface RailResult {
  providerRef: string;
  status: PaymentStatus;
  failureCode?: string;
}

export interface WebhookEvent {
  eventId: string;
  providerRef: string;
  status: PaymentStatus;
  failureCode?: string;
}

export class InvalidWebhookError extends Error {
  constructor(reason: string) {
    super(`Invalid webhook: ${reason}`);
    this.name = "InvalidWebhookError";
  }
}

/**
 * Every rail (sandbox, aggregator, EME, bank, card acquirer) sits behind this
 * interface. Swapping the sandbox for a real partner means one new class.
 */
export interface PaymentProvider {
  readonly name: string;
  collect(request: RailRequest): Promise<RailResult>;
  payout(request: RailRequest): Promise<RailResult>;
  getStatus(providerRef: string): Promise<Omit<RailResult, "providerRef">>;
  /** Checks an external wallet or bank account exists and can be debited/credited. */
  verifyAccount(account: RailRequest["account"]): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Verifies the signature and parses the body. Throws InvalidWebhookError. */
  handleWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent>;
}
