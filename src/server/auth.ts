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
/** The profile columns signed-in users may read (the sanctions flag is staff-only). */
export type Profile = Omit<Tables<"profiles">, "sanctions_status">;
const PROFILE_COLUMNS = "id, full_name, phone, user_type, country_code, city, locale, kyc_tier, onboarded_at, created_at, updated_at";

export const requireProfile = cache(async (): Promise<Profile> => {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).single();
  if (!profile) redirect("/connexion");
  if (!profile.onboarded_at) redirect("/bienvenue");
  return profile;
});
