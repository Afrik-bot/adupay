"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";
import { startDirectedPayment, type Purpose, type StartError } from "@/server/directed-payments";
import { getPaymentService } from "@/server/payments";

const PURPOSES: Purpose[] = ["school", "health", "bills", "rent", "tontine"];
const CATEGORIES: Record<Exclude<Purpose, "tontine">, string[]> = {
  school: ["school"],
  health: ["clinic", "pharmacy"],
  bills: ["utility"],
  rent: ["landlord"],
};
type SourceCurrency = "EUR" | "USD" | "CAD";
const CURRENCIES: SourceCurrency[] = ["EUR", "USD", "CAD"];

async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  return user;
}

export interface PayeeResult {
  id: string;
  name: string;
  category: string;
  city: string;
  address: string | null;
  payout_provider: string | null;
}

/** Verified payees for a purpose; RLS only returns KYB-approved ones (or the caller's own). */
export async function searchPayees(purpose: string, city: string, query: string): Promise<PayeeResult[]> {
  await requireUser();
  if (!(purpose in CATEGORIES)) return [];
  const supabase = await createClient();
  let request = supabase
    .from("payees")
    .select("id, name, category, city, address, payout_provider")
    .eq("kyb_status", "approved")
    .in("category", CATEGORIES[purpose as keyof typeof CATEGORIES] as never)
    .order("name")
    .limit(20);
  if (city.trim()) request = request.ilike("city", `%${city.trim()}%`);
  if (query.trim()) request = request.ilike("name", `%${query.trim().replace(/[%_]/g, "")}%`);
  const { data } = await request;
  return (data ?? []) as PayeeResult[];
}

export interface Quote {
  currency: SourceCurrency;
  xof_per_unit: number;
  customer_rate: number;
  fee_bps: number;
  base_amount: number;
  fee_amount: number;
  total_amount: number;
  all_in_pct: number;
}

export async function getQuote(amountXof: number, currency: string): Promise<Quote | null> {
  await requireUser();
  if (!CURRENCIES.includes(currency as SourceCurrency) || !Number.isSafeInteger(amountXof)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fx_quote", { p_amount_xof: amountXof, p_currency: currency as SourceCurrency });
  const row = data?.[0];
  if (error || !row) return null;
  return {
    currency: row.currency as SourceCurrency,
    xof_per_unit: Number(row.xof_per_unit),
    customer_rate: Number(row.customer_rate),
    fee_bps: row.fee_bps,
    base_amount: row.base_amount,
    fee_amount: row.fee_amount,
    total_amount: row.total_amount,
    all_in_pct: Number(row.all_in_pct),
  };
}

export async function payDirected(input: {
  requestKey: string;
  purpose: string;
  payeeId: string | null;
  groupId: string | null;
  beneficiaryName: string;
  reference: string;
  amountXof: number;
  currency: string;
  card: { token: string; brand: string; last4: string };
  recurring: boolean;
}): Promise<{ error: StartError | "card" } | void> {
  const user = await requireUser();
  if (!PURPOSES.includes(input.purpose as Purpose) || !CURRENCIES.includes(input.currency as SourceCurrency)) return { error: "generic" };
  // Only a sandbox token ever reaches the server; never a card number.
  if (!/^sbxcard_[a-f0-9]{12}_\d{4}$/.test(input.card.token) || !/^\d{4}$/.test(input.card.last4)) return { error: "card" };
  if (!/^[0-9a-f-]{36}$/.test(input.requestKey)) return { error: "generic" };

  const purpose = input.purpose as Purpose;
  const result = await startDirectedPayment(adminDb(), getPaymentService(), {
    senderId: user.id,
    requestKey: input.requestKey,
    purpose,
    payeeId: purpose === "tontine" ? null : input.payeeId,
    groupId: purpose === "tontine" ? input.groupId : null,
    beneficiaryName: input.beneficiaryName.slice(0, 80),
    reference: input.reference.slice(0, 80),
    amountXof: input.amountXof,
    currency: input.currency as SourceCurrency,
    card: input.card,
  });
  if ("error" in result) return result;

  if (input.recurring) {
    const next = new Date();
    next.setUTCMonth(next.getUTCMonth() + 1);
    await createAdminClient()
      .from("directed_payment_schedules")
      .insert({
        sender_id: user.id,
        purpose,
        payee_id: purpose === "tontine" ? null : input.payeeId,
        group_id: purpose === "tontine" ? input.groupId : null,
        beneficiary_name: input.beneficiaryName.slice(0, 80),
        reference: input.reference.slice(0, 80) || null,
        amount: result.directedPayment.amount,
        source_currency: input.currency as SourceCurrency,
        frequency: "monthly",
        next_run_on: next.toISOString().slice(0, 10),
        card_token: input.card.token,
        card_brand: input.card.brand,
        card_last4: input.card.last4,
        last_directed_payment_id: result.directedPayment.id,
      });
  }
  revalidatePath("/payer-pour");
  redirect(`/payer-pour/${result.directedPayment.id}`);
}

export async function setScheduleStatus(scheduleId: string, status: "active" | "paused" | "cancelled") {
  await requireUser();
  const supabase = await createClient();
  await supabase.rpc("set_schedule_status", { p_schedule_id: scheduleId, p_status: status });
  revalidatePath("/payer-pour");
}
