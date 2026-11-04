import "server-only";
import type { Currency } from "@/lib/money";
import { adminDb } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { RpcError } from "./db";
import { getPaymentService } from "./payments";
import { allow } from "./rate-limit";
import type { WalletProvider } from "./payments/types";

export type PayShareError =
  | "notMember"
  | "notStarted"
  | "alreadyPaid"
  | "noAccount"
  | "relinkAccount"
  | "kycRequired"
  | "kycLimit"
  | "tooMany"
  | "generic";

interface ContributionRow {
  id: string;
  amount: number;
  currency: Currency;
}

/**
 * Pays the signed-in user's share of the current round (or the share of the
 * member they sponsor) from their default linked account. Retrying is safe:
 * the contribution is reused and the payment is keyed on it.
 */
export async function payShare(userId: string, groupId: string): Promise<{ paymentId: string } | { error: PayShareError }> {
  if (!(await allow("payment", userId))) return { error: "tooMany" };
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("group_members")
    .select("role, sponsored_member_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) return { error: "notMember" };
  const memberId = membership.role === "sponsor" ? membership.sponsored_member_id : userId;
  if (!memberId) return { error: "notMember" };

  const { data: cycle } = await supabase
    .from("cycles")
    .select("id")
    .eq("group_id", groupId)
    .in("status", ["open", "collecting"])
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cycle) return { error: "notStarted" };

  const { data: account } = await supabase
    .from("linked_accounts")
    .select("provider, account_token, verified_at")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();
  if (!account) return { error: "noAccount" };
  if (!account.verified_at || !account.account_token) return { error: "relinkAccount" };

  const db = adminDb();
  try {
    const contribution = await db.rpc<ContributionRow>("create_contribution", {
      p_cycle_id: cycle.id,
      p_member_id: memberId,
      p_paid_by: userId,
    });
    const pot = await db.rpc<string>("ensure_ledger_account", {
      p_owner_type: "group",
      p_owner_id: groupId,
      p_currency: contribution.currency,
    });
    const payment = await getPaymentService().initiate({
      idempotencyKey: `contribution:${contribution.id}`,
      userId,
      direction: "collect",
      amount: contribution.amount,
      currency: contribution.currency,
      ledgerAccountId: pot,
      account: { provider: account.provider as WalletProvider, ref: account.account_token },
      purposeType: "contribution",
      purposeId: contribution.id,
    });
    return { paymentId: payment.id };
  } catch (error) {
    const message = error instanceof RpcError ? error.message : "";
    if (message.includes("already_paid")) return { error: "alreadyPaid" };
    if (message.includes("kyc_tier_0")) return { error: "kycRequired" };
    if (message.includes("kyc_daily_limit")) return { error: "kycLimit" };
    console.error("payShare failed", error);
    return { error: "generic" };
  }
}
