import type { Currency } from "@/lib/money";
import type { Db } from "../db";
import type { PaymentDirection, PaymentProvider, PaymentStatus, RailRequest } from "./types";

export interface PaymentRow {
  id: string;
  idempotency_key: string;
  user_id: string | null;
  direction: PaymentDirection;
  provider: string;
  provider_ref: string | null;
  amount: number;
  currency: Currency;
  ledger_account_id: string;
  status: PaymentStatus;
  failure_code: string | null;
  purpose_type: string | null;
  purpose_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InitiatePayment {
  idempotencyKey: string;
  userId: string | null;
  direction: PaymentDirection;
  amount: number;
  currency: Currency;
  /** AduPay-side account credited by a collect or debited by a payout. */
  ledgerAccountId: string;
  account: RailRequest["account"];
  purposeType?: string;
  purposeId?: string;
}

/**
 * Orchestrates a payment: record it (idempotently) in Postgres, ask the rail to
 * move money, then apply the rail's answer. All ledger posting happens inside
 * the database functions; this class never computes balances.
 */
export class PaymentService {
  constructor(
    private readonly db: Db,
    private readonly provider: PaymentProvider,
  ) {}

  async initiate(input: InitiatePayment): Promise<PaymentRow> {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new RangeError("amount must be a positive integer in minor units");
    }

    const payment = await this.db.rpc<PaymentRow>("create_payment", {
      p_idempotency_key: input.idempotencyKey,
      p_user_id: input.userId,
      p_direction: input.direction,
      p_provider: this.provider.name,
      p_amount: input.amount,
      p_currency: input.currency,
      p_ledger_account_id: input.ledgerAccountId,
      p_purpose_type: input.purposeType ?? null,
      p_purpose_id: input.purposeId ?? null,
    });

    // A retry of a request that already reached the rail: do not call it again.
    if (payment.provider_ref) return payment;

    const request: RailRequest = {
      paymentId: payment.id,
      idempotencyKey: input.idempotencyKey,
      amount: payment.amount,
      currency: payment.currency,
      account: input.account,
    };
    const result =
      input.direction === "collect" ? await this.provider.collect(request) : await this.provider.payout(request);

    await this.db.rpc("attach_provider_ref", { p_payment_id: payment.id, p_provider_ref: result.providerRef });
    if (result.status !== "pending") {
      return this.db.rpc<PaymentRow>("settle_payment", {
        p_payment_id: payment.id,
        p_status: result.status,
        p_failure_code: result.failureCode ?? null,
      });
    }
    return { ...payment, provider_ref: result.providerRef };
  }

  /** Verifies and applies a rail callback. Safe to receive the same event many times. */
  async handleWebhook(rawBody: string, headers: Headers): Promise<PaymentRow> {
    const event = await this.provider.handleWebhook(rawBody, headers);
    return this.db.rpc<PaymentRow>("settle_payment_by_ref", {
      p_provider: this.provider.name,
      p_provider_ref: event.providerRef,
      p_status: event.status,
      p_failure_code: event.failureCode ?? null,
    });
  }
}
