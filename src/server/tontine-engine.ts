import type { Currency } from "@/lib/money";
import type { Db } from "./db";
import type { PaymentService } from "./payments/service";
import type { WalletProvider } from "./payments/types";

type Step =
  | { action: "done" | "close_empty" }
  | { action: "wait"; paid: number; rotation: number }
  | { action: "blocked"; reason: string }
  | {
      action: "payout";
      amount: number;
      currency: Currency;
      recipient_id: string;
      pot_account_id: string;
      account_provider: WalletProvider;
      account_token: string;
    };

interface RetryRow {
  payout_id: string;
  cycle_id: string;
  recipient_id: string;
  amount: number;
  currency: Currency;
  attempts: number;
  pot_account_id: string;
  account_provider: WalletProvider | null;
  account_token: string | null;
}

export interface EngineReport {
  cycles: number;
  waiting: number;
  paidOut: number;
  closedEmpty: number;
  blocked: number;
  retried: number;
  completedGroups: number;
  errors: { cycleId: string; message: string }[];
}

/**
 * The daily tontine job. All decisions (reminders, penalties, whether a pot is
 * ready, commissions, the next round) are made in Postgres; this only moves the
 * payout through the payment rail. Safe to run any number of times a day.
 */
export async function runTontineEngine(db: Db, payments: PaymentService, today: string): Promise<EngineReport> {
  const report: EngineReport = { cycles: 0, waiting: 0, paidOut: 0, closedEmpty: 0, blocked: 0, retried: 0, completedGroups: 0, errors: [] };

  // Failed payouts first: their funds went back to the pot and must be re-reserved.
  for (const row of await db.rpc<RetryRow[]>("payouts_to_retry")) {
    if (!row.account_token || !row.account_provider) continue;
    try {
      const payment = await payments.initiate({
        idempotencyKey: `payout:${row.cycle_id}:${row.attempts + 1}`,
        userId: row.recipient_id,
        direction: "payout",
        amount: row.amount,
        currency: row.currency,
        ledgerAccountId: row.pot_account_id,
        account: { provider: row.account_provider, ref: row.account_token },
        purposeType: "tontine_payout",
        purposeId: row.cycle_id,
      });
      await db.rpc("record_payout_retry", { p_payout_id: row.payout_id, p_payment_id: payment.id });
      report.retried += 1;
    } catch (error) {
      report.errors.push({ cycleId: row.cycle_id, message: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const cycle of await db.rpc<{ id: string }[]>("engine_cycles")) {
    report.cycles += 1;
    try {
      const step = await db.rpc<Step>("cycle_step", { p_cycle_id: cycle.id, p_today: today });
      let outcome: string | null = null;
      if (step.action === "wait") report.waiting += 1;
      else if (step.action === "blocked") report.blocked += 1;
      else if (step.action === "close_empty") {
        outcome = await db.rpc<string>("finalize_cycle", { p_cycle_id: cycle.id, p_payment_id: null, p_amount: 0 });
        report.closedEmpty += 1;
      } else if (step.action === "payout") {
        const payment = await payments.initiate({
          idempotencyKey: `payout:${cycle.id}:1`,
          userId: step.recipient_id,
          direction: "payout",
          amount: step.amount,
          currency: step.currency,
          ledgerAccountId: step.pot_account_id,
          account: { provider: step.account_provider, ref: step.account_token },
          purposeType: "tontine_payout",
          purposeId: cycle.id,
        });
        outcome = await db.rpc<string>("finalize_cycle", { p_cycle_id: cycle.id, p_payment_id: payment.id, p_amount: step.amount });
        report.paidOut += 1;
      }
      if (outcome === "completed") report.completedGroups += 1;
    } catch (error) {
      report.errors.push({ cycleId: cycle.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}
