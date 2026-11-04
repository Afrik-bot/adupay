import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { RateForm } from "./rate-form";

export default async function FxPage() {
  const t = await getTranslations("admin.fx");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: rates } = await supabase.from("fx_rates").select("currency, xof_per_unit, fee_bps, fx_margin_bps, updated_at").order("currency");
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Abidjan" });
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </div>
      {(rates ?? []).map((r) => (
        <Card key={r.currency}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">{r.currency} → XOF</h2>
            <span className="text-xs text-muted-foreground">{t("updated", { date: when.format(new Date(r.updated_at)) })}</span>
          </div>
          <RateForm currency={r.currency as "EUR" | "USD" | "CAD"} rate={Number(r.xof_per_unit)} feeBps={r.fee_bps} marginBps={r.fx_margin_bps} />
        </Card>
      ))}
      <p className="text-xs text-muted-foreground">{t("note")}</p>
    </div>
  );
}
