"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/connexion");
}

export async function setUserType(type: "resident" | "diaspora"): Promise<{ ok: true } | { error: true }> {
  if (type !== "resident" && type !== "diaspora") return { error: true };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/connexion");
  const { error } = await supabase.from("profiles").update({ user_type: type }).eq("id", data.claims.sub);
  if (error) return { error: true };
  revalidatePath("/profil");
  revalidatePath("/credit");
  return { ok: true };
}
