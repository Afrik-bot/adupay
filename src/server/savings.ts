import type { Currency } from "@/lib/money";
import { RpcError, type Db } from "./db";
import type { PaymentService } from "./payments/service";
import type { WalletProvider } from "./payments/types";

export type SavingsError = "noAccount" | "goalLocked" | "insufficient" | "kycRequired" | "kycLimit" | "notOwner" | "generic";

function classify(error: unknown): SavingsError {
  const m = error instanceof RpcError ? error.message : error instanceof Error ? error.message : "";
  if (m.includes("goal_locked")) return "goalLocked";
  if (m.includes("goal_not_owner")) return "notOwner";
  if (m.includes("insufficient funds")) return "insufficient";
  if (m.includes("kyc_tier_0")) return "kycRequired";
  if (m.includes("kyc_daily_limit")) return "kycLimit";
  return "generic";
}

async function goalAccount(db: Db, goalId: string, currency: Currency) {
  return db.rpc<string>("ensure_ledger_account", { p_owner_type: "savings_goal", p_owner_id: goalId, p_currency: currency });
}

async function defaultAccount(db: Db, userId: string) {
  const rows = await db.rpc<{ provider: WalletProvider; account_token: string }[]>("default_payment_account", { p_user_id: userId });
  return rows[0] ?? null;
}

interface MoveInput {
  userId: string;
  goalId: string;
  currency: Currency;
  amount: number;
  requestKey: string;
}

/** Money in: from the member's default wallet into the goal. */
export async function topUpGoal(db: Db, payments: PaymentService, input: MoveInput): Promise<{ paymentId: string } | { error: SavingsError }> {
  const account = await defaultAccount(db, input.userId);
  if (!account) return { error: "noAccount" };
  try {
    const payment = await payments.initiate({
      idempotencyKey: `goal-topup:${input.requestKey}`,
      userId: input.userId,
      direction: "collect",
      amount: input.amount,
      currency: input.currency,
      ledgerAccountId: await goalAccount(db, input.goalId, input.currency),
      account: { provider: account.provider, ref: account.account_token },
      purposeType: "savings_topup",
      purposeId: input.goalId,
    });
    return { paymentId: payment.id };
  } catch (error) {
    return { error: classify(error) };
  }
}

/** Money out: from the goal back to the member's default wallet (refused while locked). */
export async function withdrawFromGoal(db: Db, payments: PaymentService, input: MoveInput): Promise<{ paymentId: string } | { error: SavingsError }> {
  const account = await defaultAccount(db, input.userId);
  if (!account) return { error: "noAccount" };
  try {
    const payment = await payments.initiate({
      idempotencyKey: `goal-withdraw:${input.requestKey}`,
      userId: input.userId,
      direction: "payout",
      amount: input.amount,
      currency: input.currency,
      ledgerAccountId: await goalAccount(db, input.goalId, input.currency),
      account: { provider: account.provider, ref: account.account_token },
      purposeType: "savings_withdrawal",
      purposeId: input.goalId,
    });
    return { paymentId: payment.id };
  } catch (error) {
    return { error: classify(error) };
  }
}

/** The weekly automatic top-ups due on or before `today` (run by the daily job). */
export async function runSavingsTopups(db: Db, payments: PaymentService, today: string) {
  let ran = 0;
  const failed: { goalId: string; error: SavingsError }[] = [];
  const due = await db.rpc<{ goal_id: string; user_id: string; amount: number; currency: Currency; run_on: string | Date }[]>("goals_due_topup", {
    p_today: today,
  });
  for (const goal of due) {
    const runOn = typeof goal.run_on === "string" ? goal.run_on.slice(0, 10) : goal.run_on.toISOString().slice(0, 10);
    const result = await topUpGoal(db, payments, {
      userId: goal.user_id,
      goalId: goal.goal_id,
      currency: goal.currency,
      amount: goal.amount,
      requestKey: `auto:${goal.goal_id}:${runOn}`,
    });
    if ("error" in result) failed.push({ goalId: goal.goal_id, error: result.error });
    // A missed week (no wallet, over the daily limit) is skipped, not retried forever.
    await db.rpc("advance_goal_topup", { p_goal_id: goal.goal_id, p_ran_on: runOn });
    ran += 1;
  }
  return { ran, failed };
}
