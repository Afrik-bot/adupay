"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";
import { payShare, type PayShareError } from "@/server/tontines";

export type CreateTontineError = "name" | "amount" | "startDate" | "limit" | "penalty" | "generic";

const FREQUENCIES = ["weekly", "biweekly", "monthly"] as const;
const ORDERS = ["fixed", "lottery", "vote"] as const;

async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  return user;
}

export async function createTontine(input: {
  name: string;
  amount: number;
  frequency: string;
  startDate: string;
  memberLimit: number;
  payoutOrder: string;
  graceDays: number;
  latePenalty: number;
}): Promise<{ error: CreateTontineError } | void> {
  await requireUser();
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) return { error: "name" };
  if (!Number.isSafeInteger(input.amount) || input.amount < 500 || input.amount > 2_000_000) return { error: "amount" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || input.startDate < new Date().toISOString().slice(0, 10)) {
    return { error: "startDate" };
  }
  if (!Number.isInteger(input.memberLimit) || input.memberLimit < 2 || input.memberLimit > 100) return { error: "limit" };
  if (!Number.isSafeInteger(input.latePenalty) || input.latePenalty < 0 || input.latePenalty > input.amount) {
    return { error: "penalty" };
  }
  if (!FREQUENCIES.includes(input.frequency as never) || !ORDERS.includes(input.payoutOrder as never)) return { error: "generic" };
  const graceDays = Math.max(0, Math.min(30, Math.round(input.graceDays)));

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_group", {
    p_name: name,
    p_contribution_amount: input.amount,
    p_frequency: input.frequency as (typeof FREQUENCIES)[number],
    p_start_date: input.startDate,
    p_member_limit: input.memberLimit,
    p_payout_order: input.payoutOrder as (typeof ORDERS)[number],
    p_grace_days: graceDays,
    p_late_penalty_amount: input.latePenalty,
  });
  if (error || !id) return { error: "generic" };
  revalidatePath("/tontines");
  redirect(`/tontines/${id}?nouvelle=1`);
}

export type JoinError = "notFound" | "started" | "full" | "generic";

export async function joinTontine(code: string): Promise<{ error: JoinError } | void> {
  await requireUser();
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("join_group", { p_invite_code: code });
  if (error || !id) {
    const m = error?.message ?? "";
    return { error: m.includes("invite_not_found") ? "notFound" : m.includes("group_started") ? "started" : m.includes("group_full") ? "full" : "generic" };
  }
  revalidatePath("/tontines");
  revalidatePath("/accueil");
  redirect(`/tontines/${id}`);
}

export async function startTontine(groupId: string): Promise<{ error: "notEnough" | "generic" } | void> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_group", { p_group_id: groupId });
  if (error) return { error: error.message.includes("not_enough_members") ? "notEnough" : "generic" };
  revalidatePath(`/tontines/${groupId}`);
  revalidatePath("/tontines");
  revalidatePath("/accueil");
}

export async function payMyShare(groupId: string): Promise<{ error: PayShareError } | void> {
  const user = await requireUser();
  const result = await payShare(user.id, groupId);
  if ("error" in result) return result;
  revalidatePath(`/tontines/${groupId}`);
  revalidatePath("/accueil");
  redirect(`/tontines/${groupId}/recu/${result.paymentId}`);
}

export type RulesError = "proposalOpen" | "penalty" | "notAllowed" | "generic";

export async function proposeRules(
  groupId: string,
  graceDays: number,
  latePenalty: number,
): Promise<{ error: RulesError } | { result: "applied" | "open" | "approved" | "rejected" }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("propose_group_rules", {
    p_group_id: groupId,
    p_grace_days: Math.max(0, Math.min(30, Math.round(graceDays))),
    p_late_penalty_amount: Math.max(0, Math.round(latePenalty)),
  });
  if (error) {
    const m = error.message;
    return { error: m.includes("proposal_open") ? "proposalOpen" : m.includes("late penalty") ? "penalty" : m.includes("only") ? "notAllowed" : "generic" };
  }
  revalidatePath(`/tontines/${groupId}`);
  return { result: data as "applied" | "open" | "approved" | "rejected" };
}

export async function voteRules(groupId: string, proposalId: string, approve: boolean) {
  await requireUser();
  const supabase = await createClient();
  await supabase.rpc("vote_group_rules", { p_proposal_id: proposalId, p_approve: approve });
  revalidatePath(`/tontines/${groupId}`);
}
