"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateAccount, WALLET_PROVIDERS, type AccountError, type WalletProvider } from "@/lib/linked-account";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";
import { allow } from "@/server/rate-limit";
import { keyedHash } from "@/server/hash";
import { getPaymentProvider } from "@/server/payments";

export type LinkAccountError = AccountError | "duplicate" | "verificationFailed" | "label" | "tooMany" | "generic";

function refresh() {
  revalidatePath("/profil/comptes");
  revalidatePath("/accueil");
}

export async function linkAccount(input: {
  provider: string;
  number: string;
  label: string;
}): Promise<{ error: LinkAccountError } | { ok: true }> {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  if (!(await allow("linkAccount", user.id))) return { error: "tooMany" };
  if (!WALLET_PROVIDERS.includes(input.provider as WalletProvider)) return { error: "generic" };
  const provider = input.provider as WalletProvider;
  const label = input.label.trim();
  if (label.length > 40) return { error: "label" };

  const account = validateAccount(provider, input.number);
  if ("error" in account) return { error: account.error };

  // Sandbox until partners are signed: confirms the account exists on the rail.
  const check = await getPaymentProvider().verifyAccount({ provider, ref: account.canonical });
  if (!check.ok) return { error: "verificationFailed" };

  const supabase = await createClient();
  const { count } = await supabase.from("linked_accounts").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  // Runs as the user: RLS ties the row to them; verified_at can only be set below.
  const { data: inserted, error } = await supabase
    .from("linked_accounts")
    .insert({
      user_id: user.id,
      provider,
      account_masked: account.masked,
      account_ref_hash: keyedHash("linked-account", `${provider}:${account.canonical}`),
      label: label || null,
      is_default: !count,
    })
    .select("id")
    .single();
  if (error || !inserted) return { error: error?.code === "23505" ? "duplicate" : "generic" };

  const { error: verifyError } = await createAdminClient()
    .from("linked_accounts")
    .update({ verified_at: new Date().toISOString(), account_token: check.token })
    .eq("id", inserted.id)
    .eq("user_id", user.id);
  if (verifyError) return { error: "generic" };

  refresh();
  return { ok: true };
}

export async function makeDefault(accountId: string) {
  const supabase = await createClient();
  await supabase.rpc("set_default_linked_account", { p_account_id: accountId });
  refresh();
}

export async function unlinkAccount(accountId: string) {
  const supabase = await createClient();
  // RLS limits the delete to the caller's own accounts.
  await supabase.from("linked_accounts").delete().eq("id", accountId);
  refresh();
}
