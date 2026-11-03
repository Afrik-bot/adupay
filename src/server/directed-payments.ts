import type { Currency } from "@/lib/money";
import { RpcError, type Db } from "./db";
import type { PaymentService } from "./payments/service";
import type { WalletProvider } from "./payments/types";

export type Purpose = "school" | "health" | "bills" | "rent" | "tontine";

export interface DirectedPaymentRow {
  id: string;
  sender_id: string;
  purpose: Purpose;
  amount: number;
  source_currency: Currency;
  source_amount: number;
  fee_amount: number;
  status: "initiated" | "paid" | "received" | "confirmed" | "failed";
}

export interface StartInput {
  senderId: string;
  requestKey: string;
  purpose: Purpose;
  payeeId: string | null;
  groupId: string | null;
  beneficiaryName: string;
  reference: string;
  amountXof: number;
  currency: Exclude<Currency, "XOF">;
  card: { token: string; brand: string; last4: string };
  schedule?: { id: string; runOn: string };
}

export type StartError = "payeeNotVerified" | "notSponsor" | "alreadyPaid" | "kycRequired" | "kycLimit" | "amount" | "generic";

function classify(error: unknown): StartError {
  const message = error instanceof RpcError ? error.message : error instanceof Error ? error.message : "";
  if (message.includes("payee_not_verified") || message.includes("payee_wrong_category")) return "payeeNotVerified";
  if (message.includes("not_sponsor")) return "notSponsor";
  if (message.includes("already_paid")) return "alreadyPaid";
  if (message.includes("kyc_tier_0")) return "kycRequired";
  if (message.includes("kyc_daily_limit")) return "kycLimit";
  if (message.includes("between 1 000 and 2 000 000")) return "amount";
  return "generic";
}

/** Records a directed payment and charges the card. Same request key = same payment. */
export async function startDirectedPayment(
  db: Db,
  payments: PaymentService,
  input: StartInput,
): Promise<{ directedPayment: DirectedPaymentRow } | { error: StartError }> {
  try {
    const dp = await db.rpc<DirectedPaymentRow>("create_directed_payment", {
      p_sender_id: input.senderId,
      p_request_key: input.requestKey,
      p_purpose: input.purpose,
      p_payee_id: input.payeeId,
      p_group_id: input.groupId,
      p_beneficiary_name: input.beneficiaryName,
      p_reference: input.reference,
      p_amount_xof: input.amountXof,
      p_currency: input.currency,
      p_card_brand: input.card.brand,
      p_card_last4: input.card.last4,
      p_schedule_id: input.schedule?.id ?? null,
      p_schedule_run_on: input.schedule?.runOn ?? null,
    });
    if (dp.status !== "initiated") return { directedPayment: dp };
    const clearing = await db.rpc<string>("system_account", { p_name: "fx_clearing", p_currency: dp.source_currency });
    await payments.initiate({
      idempotencyKey: `dp:${dp.id}`,
      userId: input.senderId,
      direction: "collect",
      amount: dp.source_amount,
      currency: dp.source_currency,
      ledgerAccountId: clearing,
      account: { provider: "card", ref: input.card.token },
      purposeType: "directed_payment",
      purposeId: dp.id,
    });
    return { directedPayment: dp };
  } catch (error) {
    const kind = classify(error);
    if (kind === "generic") console.error("startDirectedPayment failed", error);
    return { error: kind };
  }
}

interface PayoutDue {
  directed_payment_id: string;
  amount: number;
  attempt: number;
  payee_account_id: string;
  payout_provider: WalletProvider;
  payout_token: string;
}

/** Sends paid directed payments on to their payees ("Reçu" once the rail confirms). */
export async function deliverDirectedPayments(db: Db, payments: PaymentService): Promise<number> {
  let sent = 0;
  for (const due of await db.rpc<PayoutDue[]>("directed_payouts_due")) {
    try {
      await payments.initiate({
        idempotencyKey: `dp-payout:${due.directed_payment_id}:${due.attempt}`,
        userId: null,
        direction: "payout",
        amount: due.amount,
        currency: "XOF",
        ledgerAccountId: due.payee_account_id,
        account: { provider: due.payout_provider, ref: due.payout_token },
        purposeType: "directed_payout",
        purposeId: due.directed_payment_id,
      });
      sent += 1;
    } catch (error) {
      console.error("directed payout failed to start", due.directed_payment_id, error);
    }
  }
  return sent;
}

interface ScheduleRow {
  id: string;
  sender_id: string;
  purpose: Purpose;
  payee_id: string | null;
  group_id: string | null;
  beneficiary_name: string;
  reference: string | null;
  amount: number;
  source_currency: Exclude<Currency, "XOF">;
  next_run_on: string;
  card_token: string;
  card_brand: string | null;
  card_last4: string | null;
}

/** Runs recurring Payer pour schedules due on or before `today`. */
export async function runSchedules(
  db: Db,
  payments: PaymentService,
  today: string,
): Promise<{ ran: number; failed: { scheduleId: string; error: StartError }[] }> {
  const failed: { scheduleId: string; error: StartError }[] = [];
  let ran = 0;
  for (const s of await db.rpc<ScheduleRow[]>("schedules_due", { p_today: today })) {
    const runOn = typeof s.next_run_on === "string" ? s.next_run_on.slice(0, 10) : new Date(s.next_run_on).toISOString().slice(0, 10);
    const result = await startDirectedPayment(db, payments, {
      senderId: s.sender_id,
      requestKey: `schedule:${s.id}:${runOn}`,
      purpose: s.purpose,
      payeeId: s.payee_id,
      groupId: s.group_id,
      beneficiaryName: s.beneficiary_name,
      reference: s.reference ?? "",
      amountXof: s.amount,
      currency: s.source_currency,
      card: { token: s.card_token, brand: s.card_brand ?? "", last4: s.card_last4 ?? "" },
      schedule: { id: s.id, runOn },
    });
    if ("error" in result) {
      failed.push({ scheduleId: s.id, error: result.error });
      // A share already paid (e.g. by hand) still moves the schedule on.
      if (result.error !== "alreadyPaid") continue;
    }
    await db.rpc("advance_schedule", {
      p_schedule_id: s.id,
      p_ran_on: runOn,
      p_directed_payment_id: "directedPayment" in result ? result.directedPayment.id : null,
    });
    ran += 1;
  }
  return { ran, failed };
}
