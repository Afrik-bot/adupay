import "server-only";
import { computeScore, type Score } from "@/lib/score";
import { createClient } from "@/lib/supabase/server";

/** The signed-in member's Score Communauté, computed from their own data. */
export async function getMyScore(): Promise<Score> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_score_inputs");
  const row = data?.[0];
  return computeScore({
    contributionsTotal: row?.contributions_total ?? 0,
    contributionsOnTime: row?.contributions_on_time ?? 0,
    cyclesCompleted: row?.cycles_completed ?? 0,
    savingsWeeks: row?.savings_weeks ?? 0,
    accountAgeDays: row?.account_age_days ?? 0,
  });
}

export async function hasScoreSharingConsent(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_active_consent", { p_purpose: "credit_score_sharing" });
  return Boolean(data);
}
