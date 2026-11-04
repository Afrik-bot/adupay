import { getLocale, getTranslations } from "next-intl/server";
import { inputClass } from "@/components/ui/field";
import { formatMoney, type Currency, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const STATUSES = ["pending", "succeeded", "failed"] as const;
const STYLE = { pending: "bg-warning/15 text-warning", succeeded: "bg-success/15 text-success", failed: "bg-destructive/15 text-destructive" };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string }> }) {
  const { q, statut } = await searchParams;
  const t = await getTranslations("admin.transactions");
  const home = await getTranslations("home");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const status = STATUSES.includes(statut as never) ? statut : undefined;
  const { data: rows } = await supabase.rpc("admin_search_payments", { p_query: q?.slice(0, 80) || undefined, p_status: status, p_limit: 100 });
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <form method="get" className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <label htmlFor="q" className="sr-only">
          {t("search")}
        </label>
        <input id="q" name="q" defaultValue={q ?? ""} placeholder={t("placeholder")} className={inputClass} />
        <label htmlFor="statut" className="sr-only">
          {t("status")}
        </label>
        <select id="statut" name="statut" defaultValue={status ?? ""} className={inputClass}>
          <option value="">{t("allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {home(`status.${s}`)}
            </option>
          ))}
        </select>
        <button type="submit" className="min-h-12 rounded-lg border px-4 font-semibold hover:bg-muted">
          {t("submit")}
        </button>
      </form>
      <p className="text-sm text-muted-foreground">{t("count", { count: rows?.length ?? 0 })}</p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">{t("date")}</th>
              <th className="px-3 py-2 font-medium">{t("who")}</th>
              <th className="px-3 py-2 font-medium">{t("what")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("amount")}</th>
              <th className="px-3 py-2 font-medium">{t("status")}</th>
              <th className="px-3 py-2 font-medium">{t("reference")}</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="border-b last:border-0 align-top">
                <td className="px-3 py-2 whitespace-nowrap">{when.format(new Date(r.created_at))}</td>
                <td className="px-3 py-2">
                  <span className="block">{r.user_name ?? t("system")}</span>
                  {r.user_phone && <span className="block text-xs text-muted-foreground">+{r.user_phone.replace(/^\+/, "")}</span>}
                </td>
                <td className="px-3 py-2">
                  {t(`directions.${r.direction}`)}
                  {r.purpose_type ? <span className="block text-xs text-muted-foreground">{r.purpose_type}</span> : null}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">{formatMoney(r.amount, r.currency as Currency, locale)}</td>
                <td className="px-3 py-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STYLE[r.status])}>{home(`status.${r.status}`)}</span>
                  {r.failure_code && <span className="block text-xs text-destructive">{r.failure_code}</span>}
                </td>
                <td className="px-3 py-2 font-mono text-xs break-all">
                  {r.id.slice(0, 8)}
                  {r.provider_ref ? <span className="block text-muted-foreground">{r.provider_ref.slice(-12)}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
