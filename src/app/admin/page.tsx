import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";
import { formatMoney, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboard() {
  const t = await getTranslations("admin.kpis");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_kpis");
  const k = data?.[0];
  const onTime = k && k.contributions_paid > 0 ? Math.round((k.contributions_on_time / k.contributions_paid) * 1000) / 10 : null;
  const corridors = (k?.corridors ?? []) as { corridor: string; count: number; volume_xof: number }[];
  const pct = (v: number | null) => (v === null ? "–" : `${v.toLocaleString(locale === "fr" ? "fr-FR" : "en-US")}${locale === "fr" ? " %" : "%"}`);

  const tiles = [
    { label: t("activeTontines"), value: String(k?.active_tontines ?? 0), hint: t("members", { count: k?.members_in_active ?? 0 }) },
    { label: t("onTimeRate"), value: pct(onTime), hint: t("onTimeHint", { paid: k?.contributions_paid ?? 0 }) },
    { label: t("avgAllIn"), value: pct(k?.avg_all_in_pct === null || k?.avg_all_in_pct === undefined ? null : Number(k.avg_all_in_pct)), hint: t("avgAllInHint") },
    { label: t("openCases"), value: String(k?.open_risk_cases ?? 0), href: "/admin/risques" },
    { label: t("pendingKyc"), value: String(k?.pending_kyc ?? 0), href: "/admin/kyc" },
    { label: t("pendingKyb"), value: String(k?.pending_kyb ?? 0), href: "/admin/kyb" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => {
          const body = (
            <Card className="h-full gap-1 p-4">
              <p className="text-sm text-muted-foreground">{tile.label}</p>
              <p className="text-3xl font-extrabold tabular-nums">{tile.value}</p>
              {tile.hint && <p className="text-xs text-muted-foreground">{tile.hint}</p>}
            </Card>
          );
          return <li key={tile.label}>{tile.href ? <Link href={tile.href} className="block h-full hover:opacity-90">{body}</Link> : body}</li>;
        })}
      </ul>
      <Card>
        <CardTitle>{t("corridors")}</CardTitle>
        {corridors.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-medium">{t("corridor")}</th>
                <th className="py-1 text-right font-medium">{t("count")}</th>
                <th className="py-1 text-right font-medium">{t("volume")}</th>
              </tr>
            </thead>
            <tbody>
              {corridors.map((c) => (
                <tr key={c.corridor} className="border-t">
                  <td className="py-2">{c.corridor}</td>
                  <td className="py-2 text-right tabular-nums">{c.count}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(c.volume_xof, "XOF", locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted-foreground">{t("noCorridors")}</p>
        )}
      </Card>
    </div>
  );
}
