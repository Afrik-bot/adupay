import type { Db } from "../db";
import type { AirtimeProvider } from "./types";

interface Claimed {
  id: string;
  beneficiary_msisdn: string;
  operator: string;
  provider_product_id: string;
  idempotency_key: string;
  attempts: number;
}

/**
 * Sends queued top-ups (purchases and rewards) to the distributor. Safe to run
 * from several places at once: each top-up is claimed by one run, and every
 * attempt has its own key, so a retry after a failure can never deliver twice.
 */
export async function deliverTopups(db: Db, provider: AirtimeProvider, limit = 25) {
  const claimed = await db.rpc<Claimed[]>("claim_topups", { p_limit: limit });
  let sent = 0;
  let failed = 0;
  for (const t of claimed ?? []) {
    try {
      const result = await provider.purchase({ msisdn: t.beneficiary_msisdn, productId: t.provider_product_id, idempotencyKey: t.idempotency_key });
      await db.rpc("mark_topup_sent", { p_topup_id: t.id, p_provider_ref: result.providerRef, p_status: result.status, p_failure_code: result.failureCode ?? null });
      sent++;
    } catch (error) {
      // The distributor never answered: leave the claim to expire and retry (the key stays the same).
      console.error("airtime purchase failed", t.id, error);
      failed++;
    }
  }
  return { sent, failed };
}

/** Polls the distributor for top-ups whose webhook never came (daily job). */
export async function reconcileTopups(db: Db, provider: AirtimeProvider, pending: { provider_ref: string }[]) {
  let settled = 0;
  for (const t of pending) {
    const status = await provider.getStatus(t.provider_ref);
    if (status.status === "pending") continue;
    await db.rpc("complete_topup", { p_provider_ref: t.provider_ref, p_status: status.status, p_failure_code: status.failureCode ?? null });
    settled++;
  }
  return settled;
}
