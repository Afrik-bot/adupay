import type { Db } from "../db";
import type { PaymentRow } from "./service";
import type { PaymentProvider } from "./types";

export interface ReconciliationReport {
  checked: number;
  ok: number;
  pending: number;
  settled: number;
  mismatches: number;
  errors: { paymentId: string; message: string }[];
}

/**
 * Asks the rail for the status of every open or recently changed payment and
 * lets Postgres compare it with the ledger. Missed webhooks get applied;
 * disagreements become risk_events for a human to review.
 */
export async function reconcile(
  db: Db,
  provider: PaymentProvider,
  { since = new Date(Date.now() - 24 * 60 * 60 * 1000), limit = 500 } = {},
): Promise<ReconciliationReport> {
  const payments = await db.rpc<PaymentRow[]>("payments_to_reconcile", {
    p_provider: provider.name,
    p_since: since.toISOString(),
    p_limit: limit,
  });

  const report: ReconciliationReport = { checked: 0, ok: 0, pending: 0, settled: 0, mismatches: 0, errors: [] };
  for (const payment of payments) {
    report.checked += 1;
    try {
      const rail = await provider.getStatus(payment.provider_ref!);
      const outcome = await db.rpc<"ok" | "pending" | "settled" | "mismatch">("reconcile_payment", {
        p_payment_id: payment.id,
        p_provider_status: rail.status,
        p_failure_code: rail.failureCode ?? null,
      });
      if (outcome === "mismatch") report.mismatches += 1;
      else report[outcome] += 1;
    } catch (error) {
      report.errors.push({ paymentId: payment.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}
