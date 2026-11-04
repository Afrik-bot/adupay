"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";

// Every action calls an audited, staff-checked database function: the checks
// do not rely on this page being hidden.
async function staffClient() {
  if (!(await getSessionUser())) redirect("/connexion?next=/admin");
  return createClient();
}

type Result = { ok: true } | { error: string };
const done = (error: { message: string } | null, path: string): Result => {
  if (error) return { error: error.message };
  revalidatePath(path);
  revalidatePath("/admin");
  return { ok: true };
};

export async function reviewKyc(recordId: string, approve: boolean, reason: string): Promise<Result> {
  const supabase = await staffClient();
  const { error } = await supabase.rpc("review_kyc_record", {
    p_record_id: recordId,
    p_decision: approve ? "approved" : "rejected",
    p_reason: approve ? undefined : reason,
  });
  return done(error, "/admin/kyc");
}

export async function reviewPayee(payeeId: string, approve: boolean, reason: string): Promise<Result> {
  const supabase = await staffClient();
  const { error } = await supabase.rpc("review_payee", { p_payee_id: payeeId, p_approve: approve, p_reason: approve ? undefined : reason });
  return done(error, "/admin/kyb");
}

export async function updateCase(riskEventId: string, status: "open" | "reviewing" | "closed" | "escalated", note: string): Promise<Result> {
  const supabase = await staffClient();
  const { error } = await supabase.rpc("update_risk_case", { p_risk_event_id: riskEventId, p_status: status, p_note: note });
  return done(error, "/admin/risques");
}

export async function clearSanctions(subject: "profile" | "payee", id: string, reason: string): Promise<Result> {
  const supabase = await staffClient();
  const { error } = await supabase.rpc("clear_sanctions_hit", { p_subject: subject, p_id: id, p_reason: reason });
  return done(error, "/admin/risques");
}

export async function setFxRate(currency: "EUR" | "USD" | "CAD", rate: number, feeBps: number, marginBps: number): Promise<Result> {
  if (!(rate > 0) || !Number.isInteger(feeBps) || !Number.isInteger(marginBps)) return { error: "invalid" };
  const supabase = await staffClient();
  const { error } = await supabase.rpc("set_fx_rate", { p_currency: currency, p_xof_per_unit: rate, p_fee_bps: feeBps, p_fx_margin_bps: marginBps });
  return done(error, "/admin/taux");
}
