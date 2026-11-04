import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronRight, Phone, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatE164 } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser, requireProfile } from "@/server/auth";
import { KycCard } from "./kyc-card";
import { Preferences } from "./preferences";
import { Residence } from "./residence";
import { SignOutButton } from "./sign-out-button";

export default async function ProfilPage() {
  const profile = await requireProfile();
  const user = await getSessionUser();
  const t = await getTranslations("profile");
  const accountsT = await getTranslations("accounts");
  const ussdT = await getTranslations("ussdSim");
  const locale = await getLocale();
  const supabase = await createClient();

  const [{ data: status }, { data: records }] = await Promise.all([
    supabase.rpc("my_kyc_status").single(),
    supabase
      .from("kyc_records")
      .select("id, document_type, status, rejection_reason, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false }),
  ]);

  const phone = user?.phone ? formatE164(user.phone.startsWith("+") ? user.phone : `+${user.phone}`) : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <Card>
        <div>
          <p className="text-xl font-semibold">{profile.full_name}</p>
          {profile.city && <p className="text-muted-foreground">{profile.city}</p>}
        </div>
        {phone && (
          <p>
            <span className="text-sm text-muted-foreground">{t("phone")} · </span>
            <span className="tabular-nums">{phone}</span>
          </p>
        )}
      </Card>
      <Link
        href="/profil/comptes"
        className="flex min-h-16 items-center justify-between gap-3 rounded-xl border bg-card p-5 font-semibold hover:bg-muted"
      >
        <span className="flex items-center gap-3">
          <Wallet aria-hidden className="size-6" />
          {accountsT("title")}
        </span>
        <ChevronRight aria-hidden className="size-5" />
      </Link>
      <Link
        href="/ussd"
        className="flex min-h-16 items-center justify-between gap-3 rounded-xl border bg-card p-5 font-semibold hover:bg-muted"
      >
        <span className="flex items-center gap-3">
          <Phone aria-hidden className="size-6" />
          {ussdT("link")}
        </span>
        <ChevronRight aria-hidden className="size-5" />
      </Link>
      <KycCard
        tier={status?.kyc_tier ?? profile.kyc_tier}
        limit={status?.daily_limit_xof ?? 0}
        used={status?.used_today_xof ?? 0}
        records={records ?? []}
      />
      <Residence value={profile.user_type} />
      <Preferences
        locale={locale}
        labels={{
          language: t("language"),
          theme: t("theme"),
          light: t("themeLight"),
          dark: t("themeDark"),
          system: t("themeSystem"),
        }}
      />
      <SignOutButton />
    </div>
  );
}
