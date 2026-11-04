"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateAccount, WALLET_PROVIDERS, type WalletProvider } from "@/lib/linked-account";
import { toE164 } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";
import { getPaymentProvider } from "@/server/payments";

const CATEGORIES = ["school", "clinic", "pharmacy", "utility", "landlord"] as const;
// RCCM numbers look like CI-ABJ-2019-B-12345 (country, court, year, form, number).
const RCCM = /^[A-Z]{2}-[A-Z]{3}-\d{4}-[A-Z]-\d{2,6}$/;

export type RegisterError =
  | "name"
  | "rccm"
  | "category"
  | "city"
  | "contact"
  | "documents"
  | "invalidNumber"
  | "wrongNetwork"
  | "invalidIban"
  | "verificationFailed"
  | "alreadyRegistered"
  | "generic";

async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/connexion?next=/payee");
  return user;
}

type VerifiedPayout = { provider: WalletProvider; masked: string; token: string };

async function verifyPayout(
  provider: string,
  number: string,
): Promise<VerifiedPayout | { error: "invalidNumber" | "wrongNetwork" | "invalidIban" | "verificationFailed" }> {
  if (!WALLET_PROVIDERS.includes(provider as WalletProvider)) return { error: "invalidNumber" };
  const account = validateAccount(provider as WalletProvider, number);
  if ("error" in account) return { error: account.error };
  const check = await getPaymentProvider().verifyAccount({ provider: provider as WalletProvider, ref: account.canonical });
  if (!check.ok) return { error: "verificationFailed" };
  return { provider: provider as WalletProvider, masked: account.masked, token: check.token };
}

export async function registerPayee(input: {
  name: string;
  rccm: string;
  category: string;
  city: string;
  address: string;
  contactPhone: string;
  payoutProvider: string;
  payoutNumber: string;
  documents: { type: "rccm" | "manager_id"; path: string }[];
}): Promise<{ error: RegisterError } | void> {
  const user = await requireUser();
  const name = input.name.trim();
  const rccm = input.rccm.trim().toUpperCase().replace(/\s+/g, "");
  if (name.length < 3 || name.length > 100) return { error: "name" };
  if (!RCCM.test(rccm)) return { error: "rccm" };
  if (!CATEGORIES.includes(input.category as never)) return { error: "category" };
  if (input.city.trim().length < 2) return { error: "city" };
  const contact = toE164(input.contactPhone, "CI");
  if (!contact) return { error: "contact" };
  const types = new Set(input.documents.map((d) => d.type));
  if (!types.has("rccm") || !types.has("manager_id") || input.documents.some((d) => !d.path.startsWith(`${user.id}/`))) {
    return { error: "documents" };
  }

  const payout = await verifyPayout(input.payoutProvider, input.payoutNumber);
  if ("error" in payout) return { error: payout.error };

  // Server-side insert: the payout token never passes through the browser.
  const admin = createAdminClient();
  const { data: payee, error } = await admin
    .from("payees")
    .insert({
      name,
      rccm_number: rccm,
      category: input.category as (typeof CATEGORIES)[number],
      city: input.city.trim(),
      address: input.address.trim() || null,
      contact_phone: contact,
      owner_id: user.id,
      kyb_status: "pending",
      payout_provider: payout.provider,
      payout_account_masked: payout.masked,
      payout_account_token: payout.token,
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !payee) return { error: error?.code === "23505" ? "alreadyRegistered" : "generic" };

  await admin.from("kyb_documents").insert(input.documents.map((d) => ({ payee_id: payee.id, document_type: d.type, document_path: d.path })));
  revalidatePath("/payee");
}

export async function confirmReceipt(directedPaymentId: string): Promise<{ error: "notReceived" | "generic" } | void> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_directed_payment", { p_directed_payment_id: directedPaymentId });
  if (error) return { error: error.message.includes("not_received_yet") ? "notReceived" : "generic" };
  revalidatePath("/payee");
}

export async function updateContact(contactPhone: string, address: string): Promise<{ error: "contact" | "generic" } | { ok: true }> {
  await requireUser();
  const contact = toE164(contactPhone, "CI");
  if (!contact) return { error: "contact" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_payee_contact", { p_contact_phone: contact, p_address: address });
  if (error) return { error: "generic" };
  revalidatePath("/payee/parametres");
  return { ok: true };
}

export async function changePayoutAccount(
  provider: string,
  number: string,
): Promise<{ error: "invalidNumber" | "wrongNetwork" | "invalidIban" | "verificationFailed" | "generic" } | { ok: true }> {
  const user = await requireUser();
  const payout = await verifyPayout(provider, number);
  if ("error" in payout) return { error: payout.error };
  const admin = createAdminClient();
  const { data: payee } = await admin.from("payees").select("id, payout_account_masked").eq("owner_id", user.id).maybeSingle();
  if (!payee) return { error: "generic" };
  const { error } = await admin
    .from("payees")
    .update({ payout_provider: payout.provider, payout_account_masked: payout.masked, payout_account_token: payout.token })
    .eq("id", payee.id);
  if (error) return { error: "generic" };
  // Where a business gets paid is sensitive: every change is on the record.
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "payee.payout_account_changed",
    target_table: "payees",
    target_id: payee.id,
    details: { from: payee.payout_account_masked, to: payout.masked, provider: payout.provider },
  });
  revalidatePath("/payee/parametres");
  return { ok: true };
}
