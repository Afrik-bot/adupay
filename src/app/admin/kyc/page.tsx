import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { formatE164 } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { KycDecision } from "./kyc-decision";

/** KYC review queue: documents waiting for a decision, grouped per person. */
export default async function KycQueuePage() {
  const t = await getTranslations("admin.kyc");
  const kyc = await getTranslations("kyc");
  const locale = await getLocale();
  const supabase = await createClient();
  // Staff RLS: admins read every record and profile.
  const { data: records } = await supabase
    .from("kyc_records")
    .select("id, user_id, document_type, tier_requested, id_number_last4, created_at")
    .eq("status", "pending")
    .order("created_at");
  const userIds = [...new Set((records ?? []).map((r) => r.user_id))];
  const { data: people } = userIds.length
    ? await supabase.from("profiles").select("id, full_name, kyc_tier, city, country_code").in("id", userIds)
    : { data: [] };
  // Phone numbers are not readable through the table; staff get them here.
  const { data: phoneRows } = await supabase.rpc("contact_phones", { p_user_ids: userIds });
  const phones = new Map((phoneRows ?? []).map((r) => [r.user_id, r.phone]));
  const { data: flags } = await supabase.rpc("admin_sanctions_flags", { p_profile_ids: userIds, p_payee_ids: [] });
  const flagged = new Set((flags ?? []).filter((f) => f.sanctions_status === "hit").map((f) => f.id));
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Abidjan" });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead", { count: records?.length ?? 0 })}</p>
      </div>
      {!records?.length && <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("empty")}</p>}
      {(people ?? []).map((person) => (
        <Card key={person.id}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{person.full_name}</h2>
            <span className="text-sm text-muted-foreground">
              {phones.get(person.id) ? formatE164(`+${phones.get(person.id)!.replace(/^\+/, "")}`) : ""} · {person.city} ({person.country_code}) · {t("tier", { tier: person.kyc_tier })}
            </span>
          </div>
          {flagged.has(person.id) && <p className="rounded-lg bg-destructive/15 p-2 text-sm font-semibold text-destructive">{t("sanctionsWarning")}</p>}
          <ul className="divide-y">
            {(records ?? [])
              .filter((r) => r.user_id === person.id)
              .map((r) => (
                <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">
                      {kyc(`docTypes.${r.document_type}` as "docTypes.cni")} · {t("forTier", { tier: r.tier_requested })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {when.format(new Date(r.created_at))}
                      {r.id_number_last4 ? ` · ${t("idLast4", { last4: r.id_number_last4 })}` : ""}
                    </p>
                    <a href={`/api/kyc/documents/${r.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline-offset-4 hover:underline">
                      {t("view")}
                    </a>
                  </div>
                  <KycDecision recordId={r.id} />
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
