import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";
import { OnboardingWizard } from "./wizard";

export default async function BienvenuePage() {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, user_type, city, country_code, onboarded_at")
    .eq("id", user.id)
    .single();
  if (profile?.onboarded_at) redirect("/accueil");

  return (
    <OnboardingWizard
      locale={await getLocale()}
      initial={{
        fullName: profile?.full_name ?? "",
        userType: profile?.user_type ?? null,
        city: profile?.city ?? "",
        countryCode: profile?.country_code && profile.country_code !== "CI" ? profile.country_code : "FR",
      }}
    />
  );
}
