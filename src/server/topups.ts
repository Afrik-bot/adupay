import type { Currency } from "@/lib/money";
import { RpcError, type Db } from "./db";
import type { PaymentService } from "./payments/service";
import type { AccountKind } from "./payments/types";

export type PayWith = "balance" | "mobile_money" | "card";
export type TopupError = "invalidNumber" | "product" | "kycRequired" | "kycLimit" | "insufficient" | "noAccount" | "relinkAccount" | "card" | "generic";

export interface TopupRow {
  id: string;
  status: string;
  amount_xof: number;
  source_currency: Currency;
  source_amount: number;
}

export interface StartTopupInput {
  buyerId: string;
  requestKey: string;
  msisdn: string;
  beneficiaryName: string | null;
  operator: "orange" | "mtn" | "moov";
  productId: string;
  payWith: PayWith;
  /** XOF unless paying by card (EUR/USD/CAD at the FX table's customer rate). */
  currency: Currency;
  /** mobile_money: the default linked account; card: a sandbox card token. */
  account?: { provider: AccountKind; ref: string };
}

function classify(error: unknown): TopupError {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("invalid_number")) return "invalidNumber";
  if (message.includes("unknown_product")) return "product";
  if (message.includes("kyc_tier_0")) return "kycRequired";
  if (message.includes("kyc_daily_limit")) return "kycLimit";
  if (message.includes("insufficient_balance")) return "insufficient";
  return "generic";
}

/**
 * Buys airtime or data. The top-up and (for the AduPay balance) its ledger entry
 * are written by create_topup in one transaction; mobile money and card then go
 * through the normal payment rails and the delivery is queued when they settle.
 * The same requestKey always returns the same top-up.
 */
export async function startTopup(db: Db, payments: PaymentService, input: StartTopupInput): Promise<{ topup: TopupRow } | { error: TopupError }> {
  if ((input.payWith === "card") !== (input.currency !== "XOF")) return { error: "generic" };
  if (input.payWith !== "balance" && !input.account) return { error: input.payWith === "card" ? "card" : "noAccount" };
  try {
    const topup = await db.rpc<TopupRow>("create_topup", {
      p_buyer_id: input.buyerId,
      p_msisdn: input.msisdn,
      p_beneficiary_name: input.beneficiaryName,
      p_operator: input.operator,
      p_product_id: input.productId,
      p_pay_with: input.payWith,
      p_currency: input.currency,
      p_idempotency_key: `topup:${input.requestKey}`,
    });
    if (topup.status !== "awaiting_payment" || input.payWith === "balance") return { topup };
    // Mobile money lands in the buyer's AduPay wallet; a card in fx_clearing for conversion.
    const ledgerAccountId =
      input.payWith === "card"
        ? await db.rpc<string>("system_account", { p_name: "fx_clearing", p_currency: topup.source_currency })
        : await db.rpc<string>("ensure_ledger_account", { p_owner_type: "user", p_owner_id: input.buyerId, p_currency: "XOF" });
    await payments.initiate({
      idempotencyKey: `topup-pay:${topup.id}`,
      userId: input.buyerId,
      direction: "collect",
      amount: topup.source_amount,
      currency: topup.source_currency,
      ledgerAccountId,
      account: input.account!,
      purposeType: "topup",
      purposeId: topup.id,
    });
    return { topup };
  } catch (error) {
    const kind = error instanceof RpcError || error instanceof Error ? classify(error) : "generic";
    if (kind === "generic") console.error("startTopup failed", error);
    return { error: kind };
  }
}
