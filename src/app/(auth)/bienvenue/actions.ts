"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";

export type OnboardingError = "name" | "city" | "type" | "generic";

const RESIDENCE_COUNTRIES = new Set(["CI", "FR", "US", "CA", "SN", "ML", "BF", "NE", "TG", "BJ", "GW", "XX"]);

const NEXT_COOKIE = "adupay_next";
const SAFE_NEXT = /^\/(?!\/)[a-z0-9/_-]*$/i;

export async function completeOnboarding(input: {
  locale: string;
  userType: string;
  fullName: string;
  city: string;
  countryCode: string;
}): Promise<{ error: OnboardingError } | void> {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");

  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  const city = input.city.trim();
  if (fullName.length < 2 || fullName.length > 80) return { error: "name" };
  if (city.length < 2 || city.length > 60) return { error: "city" };
  if (input.userType !== "resident" && input.userType !== "diaspora") return { error: "type" };
  const countryCode = input.userType === "resident" ? "CI" : input.countryCode;
  if (!RESIDENCE_COUNTRIES.has(countryCode)) return { error: "generic" };
  const locale = isLocale(input.locale) ? input.locale : "fr";

  // Runs as the user: RLS limits this to their own row and to these columns.
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      user_type: input.userType,
      city,
      country_code: countryCode,
      locale,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { error: "generic" };

  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  // A first sign-in from an invite or payee link comes back to that link (same-site paths only).
  let next = jar.get(NEXT_COOKIE)?.value;
  try {
    next = next && decodeURIComponent(next);
  } catch {
    next = undefined;
  }
  jar.delete(NEXT_COOKIE);
  redirect(next && SAFE_NEXT.test(next) ? next : "/accueil");
}
