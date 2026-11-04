import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { PayeeDecision } from "./payee-decision";

/** KYB review queue: businesses waiting to be allowed to receive payments. */
export default async function KybQueuePage() {
  const t = await getTranslations("admin.kyb");
  const register = await getTranslations("payee.register");
  const accounts = await getTranslations("accounts");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: payees } = await supabase
    .from("payees")
    .select("id, name, rccm_number, category, city, address, contact_phone, payout_provider, payout_account_masked, submitted_at, sanctions_status")
    .eq("kyb_status", "pending")
    .order("submitted_at");
  const ids = (payees ?? []).map((p) => p.id);
  const { data: docs } = ids.length
    ? await supabase.from("kyb_documents").select("id, payee_id, document_type").in("payee_id", ids)
    : { data: [] };
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { dateStyle: "medium", timeZone: "Africa/Abidjan" });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead", { count: payees?.length ?? 0 })}</p>
      </div>
      {!payees?.length && <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("empty")}</p>}
      {(payees ?? []).map((p) => (
        <Card key={p.id}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{p.name}</h2>
            {p.submitted_at && <span className="text-sm text-muted-foreground">{t("submitted", { date: when.format(new Date(p.submitted_at)) })}</span>}
          </div>
          {p.sanctions_status === "hit" && <p className="rounded-lg bg-destructive/15 p-2 text-sm font-semibold text-destructive">{t("sanctionsWarning")}</p>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{register("rccm")}</dt>
            <dd className="font-mono">{p.rccm_number}</dd>
            <dt className="text-muted-foreground">{register("category")}</dt>
            <dd>{register(`categories.${p.category}`)}</dd>
            <dt className="text-muted-foreground">{register("address")}</dt>
            <dd>{[p.address, p.city].filter(Boolean).join(", ")}</dd>
            <dt className="text-muted-foreground">{register("contact")}</dt>
            <dd>{p.contact_phone}</dd>
            <dt className="text-muted-foreground">{register("payout")}</dt>
            <dd>
              {p.payout_provider ? accounts(`providers.${p.payout_provider}`) : ""} {p.payout_account_masked}
            </dd>
          </dl>
          <div className="flex flex-wrap gap-3">
            {(docs ?? [])
              .filter((d) => d.payee_id === p.id)
              .map((d) => (
                <a key={d.id} href={`/api/kyb/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline-offset-4 hover:underline">
                  {t(`docs.${d.document_type}` as "docs.rccm")}
                </a>
              ))}
          </div>
          <PayeeDecision payeeId={p.id} />
        </Card>
      ))}
    </div>
  );
}
