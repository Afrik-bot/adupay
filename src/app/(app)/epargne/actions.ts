"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";
import { allow } from "@/server/rate-limit";
import { getPaymentService } from "@/server/payments";
import { topUpGoal, withdrawFromGoal, type SavingsError } from "@/server/savings";

const KINDS = ["school", "tabaski", "rent", "custom"] as const;

async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  return user;
}

export type GoalFormError = "name" | "target" | "lockDate" | "weekly" | "generic";

export async function createGoal(input: {
  kind: string;
  name: string;
  target: number;
  lockUntil: string;
  weekly: number | null;
  auto: boolean;
}): Promise<{ error: GoalFormError } | void> {
  const user = await requireUser();
  if (!KINDS.includes(input.kind as never)) return { error: "generic" };
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) return { error: "name" };
  if (!Number.isSafeInteger(input.target) || input.target < 1_000 || input.target > 50_000_000) return { error: "target" };
  const today = new Date().toISOString().slice(0, 10);
  if (input.lockUntil && (!/^\d{4}-\d{2}-\d{2}$/.test(input.lockUntil) || input.lockUntil <= today)) return { error: "lockDate" };
  if (input.weekly !== null && (!Number.isSafeInteger(input.weekly) || input.weekly < 500 || input.weekly > input.target)) return { error: "weekly" };
  if (input.auto && input.weekly === null) return { error: "weekly" };

  // Runs as the user: RLS ties the goal to them.
  const supabase = await createClient();
  const { data: goal, error } = await supabase
    .from("savings_goals")
    .insert({
      user_id: user.id,
      kind: input.kind,
      name,
      target_amount: input.target,
      currency: "XOF",
      lock_until: input.lockUntil || null,
      weekly_topup_amount: input.weekly,
    })
    .select("id")
    .single();
  if (error || !goal) return { error: "generic" };
  if (input.auto) {
    // First automatic top-up on the next daily run, then every 7 days.
    await supabase.from("savings_goals").update({ auto_topup: true, next_topup_on: today }).eq("id", goal.id);
  }
  revalidatePath("/epargne");
  redirect(`/epargne/${goal.id}`);
}

async function ownGoal(goalId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("savings_goals").select("id, currency").eq("id", goalId).maybeSingle();
  return data;
}

export async function addToGoal(goalId: string, amount: number, requestKey: string): Promise<{ error: SavingsError | "amount" | "tooMany" } | { ok: true }> {
  const user = await requireUser();
  if (!(await allow("payment", user.id))) return { error: "tooMany" };
  if (!Number.isSafeInteger(amount) || amount < 500) return { error: "amount" };
  const goal = await ownGoal(goalId);
  if (!goal) return { error: "notOwner" };
  const result = await topUpGoal(adminDb(), getPaymentService(), { userId: user.id, goalId, currency: "XOF", amount, requestKey });
  if ("error" in result) return result;
  revalidatePath(`/epargne/${goalId}`);
  return { ok: true };
}

export async function withdrawGoal(goalId: string, amount: number, requestKey: string): Promise<{ error: SavingsError | "amount" | "tooMany" } | { ok: true }> {
  const user = await requireUser();
  if (!(await allow("payment", user.id))) return { error: "tooMany" };
  if (!Number.isSafeInteger(amount) || amount < 500) return { error: "amount" };
  const goal = await ownGoal(goalId);
  if (!goal) return { error: "notOwner" };
  const result = await withdrawFromGoal(adminDb(), getPaymentService(), { userId: user.id, goalId, currency: "XOF", amount, requestKey });
  if ("error" in result) return result;
  revalidatePath(`/epargne/${goalId}`);
  return { ok: true };
}

export async function setAutoTopup(goalId: string, on: boolean) {
  await requireUser();
  const supabase = await createClient();
  await supabase
    .from("savings_goals")
    .update(on ? { auto_topup: true, next_topup_on: new Date().toISOString().slice(0, 10) } : { auto_topup: false })
    .eq("id", goalId);
  revalidatePath(`/epargne/${goalId}`);
}

export async function grantScoreSharing() {
  const user = await requireUser();
  const supabase = await createClient();
  // Unique per active consent: a second tap is harmless.
  await supabase.from("consents").insert({ user_id: user.id, purpose: "credit_score_sharing" });
  revalidatePath("/epargne/score");
  redirect("/epargne/offres");
}

export async function revokeScoreSharing() {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("consents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("purpose", "credit_score_sharing")
    .is("revoked_at", null);
  revalidatePath("/epargne/score");
  redirect("/epargne/score");
}
