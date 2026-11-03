import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

/** The signed-in user's id and phone, verified from the session JWT. */
export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, phone: typeof claims.phone === "string" ? claims.phone : null };
});

/** For app pages: signed in and onboarded, or redirect to the step that is missing. */
export const requireProfile = cache(async (): Promise<Tables<"profiles">> => {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/connexion");
  if (!profile.onboarded_at) redirect("/bienvenue");
  return profile;
});
