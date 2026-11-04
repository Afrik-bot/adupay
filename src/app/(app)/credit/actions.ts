"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OPERATORS, type Operator } from "@/lib/airtime";
import { isCurrency } from "@/lib/money";
import { toE164 } from "@/lib/phone";
import { adminDb } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendTopupsSoon } from "@/server/airtime";
import { getSessionUser } from "@/server/auth";
import { getPaymentService } from "@/server/payments";
import type { WalletProvider } from "@/server/payments/types";
import { allow } from "@/server/rate-limit";
import { startTopup, type PayWith, type TopupError } from "@/server/topups";

async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  return user;
}

const digits = (e164: string) => e164.replace(/\D/g, "");

export async function buyTopup(input: {
  requestKey: string;
  number: string;
  name: string;
  operator: string;
  productId: string;
  payWith: string;
  currency: string;
  card?: { token: string; brand: string; last4: string };
  save: boolean;
}): Promise<{ error: TopupError | "tooMany" } | void> {
  const user = await requireUser();
  if (!(await allow("payment", user.id))) return { error: "tooMany" };
  // The wizard sends 225 + 10 digits; typed numbers may also come as "07 …".
  const raw = digits(input.number);
  const e164 = /^225\d{10}$/.test(raw) ? `+${raw}` : toE164(input.number, "CI");
  if (!e164 || !/^225\d{10}$/.test(digits(e164))) return { error: "invalidNumber" };
  if (!OPERATORS.includes(input.operator as Operator) || !["balance", "mobile_money", "card"].includes(input.payWith)) return { error: "generic" };
  if (!isCurrency(input.currency) || !/^[0-9a-f-]{36}$/.test(input.productId) || !/^[0-9a-f-]{36}$/.test(input.requestKey)) return { error: "generic" };
  const payWith = input.payWith as PayWith;
  const supabase = await createClient();

  let account: { provider: WalletProvider | "card"; ref: string } | undefined;
  if (payWith === "mobile_money") {
    const { data: linked } = await supabase.from("linked_accounts").select("provider, account_token, verified_at").eq("user_id", user.id).eq("is_default", true).maybeSingle();
    if (!linked) return { error: "noAccount" };
    if (!linked.verified_at || !linked.account_token) return { error: "relinkAccount" };
    account = { provider: linked.provider as WalletProvider, ref: linked.account_token };
  } else if (payWith === "card") {
    // Only a sandbox token ever reaches the server; never a card number.
    if (!input.card || !/^sbxcard_[a-f0-9]{12}_\d{4}$/.test(input.card.token)) return { error: "card" };
    account = { provider: "card", ref: input.card.token };
  }

  const name = input.name.trim().slice(0, 60);
  const result = await startTopup(adminDb(), getPaymentService(), {
    buyerId: user.id,
    requestKey: input.requestKey,
    msisdn: digits(e164),
    beneficiaryName: name || null,
    operator: input.operator as Operator,
    productId: input.productId,
    payWith,
    currency: payWith === "card" ? input.currency : "XOF",
    account,
  });
  if ("error" in result) return result;
  if (input.save) {
    await supabase.from("saved_numbers").upsert(
      { user_id: user.id, msisdn: digits(e164), name: name || digits(e164), operator: input.operator as Operator },
      { onConflict: "user_id,msisdn", ignoreDuplicates: true },
    );
  }
  if (result.topup.status === "queued") sendTopupsSoon();
  revalidatePath("/accueil");
  redirect(`/credit/${result.topup.id}`);
}

export async function saveNumber(msisdn: string, name: string, operator: string): Promise<{ ok: true } | { error: true }> {
  const user = await requireUser();
  const d = digits(msisdn);
  if (!/^225\d{10}$/.test(d) || !OPERATORS.includes(operator as Operator)) return { error: true };
  const supabase = await createClient();
  const { error } = await supabase
    .from("saved_numbers")
    .upsert({ user_id: user.id, msisdn: d, name: name.trim().slice(0, 60) || d, operator: operator as Operator }, { onConflict: "user_id,msisdn", ignoreDuplicates: true });
  if (error) return { error: true };
  revalidatePath("/credit");
  return { ok: true };
}

export async function deleteSavedNumber(id: string) {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("saved_numbers").delete().eq("id", id);
  revalidatePath("/credit");
}
